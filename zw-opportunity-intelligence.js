/******************************************************************************
 * GRIDV21 ZIMBABWE CONSTRUCTION OPPORTUNITY INTELLIGENCE
 * VERSION 1.1.0
 *
 * Zimbabwe Electronic Government Procurement System
 * Procurement Regulatory Authority of Zimbabwe (PRAZ)
 *
 * Uses existing GRIDV21 dependencies:
 *   - axios
 *   - crypto
 *
 * Reuses existing GRIDV21 tables:
 *   - acquisition_sources
 *   - acquisition_records
 *   - opportunity_scores
 *   - acquisition_runs
 *   - v_gridv21_zw_opportunities
 ******************************************************************************/

import crypto from "crypto";
import axios from "axios";

const VERSION = "1.1.0";

const BASE_URL = "https://egp.praz.org.zw";

const REQUEST_TIMEOUT =
  Number(process.env.ZW_REQUEST_TIMEOUT || 30000);

const MAX_PAGES =
  Number(process.env.ZW_EGP_MAX_PAGES || 10);

const PAGE_DELAY =
  Number(process.env.ZW_PAGE_DELAY_MS || 500);

const DETAIL_DELAY =
  Number(process.env.ZW_DETAIL_DELAY_MS || 300);

const DEFAULT_USD_ZAR_RATE =
  Number(process.env.ZW_USD_ZAR_RATE || 18);

/*
 * IMPORTANT:
 * acquisition_sources.scan_frequency_minutes is NOT NULL.
 * Every source below therefore has an explicit value.
 */

export const ZW_SOURCE_CONFIG = [
  {
    id: "ZW_EGP_LATEST",
    country: "ZW",
    province: null,
    municipality: null,
    category: "public_tenders",
    type: "egp_html",
    endpoint:
      "https://egp.praz.org.zw/Indexes/index",
    enabled: true,
    confidence: 100,
    scan_frequency_minutes: 30,
    metadata: {
      authority:
        "Procurement Regulatory Authority of Zimbabwe",
      source_name:
        "Zimbabwe Electronic Government Procurement System",
      bulletin_type:
        "Latest Tenders",
      construction_focus: true
    }
  },

  {
    id: "ZW_EGP_PAST",
    country: "ZW",
    province: null,
    municipality: null,
    category: "past_tenders",
    type: "egp_html",
    endpoint:
      "https://egp.praz.org.zw/indexes/get-former-opportunities",
    enabled: false,
    confidence: 100,
    scan_frequency_minutes: 360,
    metadata: {
      authority:
        "Procurement Regulatory Authority of Zimbabwe",
      source_name:
        "Zimbabwe Electronic Government Procurement System",
      bulletin_type:
        "Past Tenders",
      construction_focus: true
    }
  },

  {
    id: "ZW_EGP_AWARDS",
    country: "ZW",
    province: null,
    municipality: null,
    category: "award_notices",
    type: "egp_html",
    endpoint:
      "https://egp.praz.org.zw/Indexes/index",
    enabled: false,
    confidence: 100,
    scan_frequency_minutes: 360,
    metadata: {
      authority:
        "Procurement Regulatory Authority of Zimbabwe",
      source_name:
        "Zimbabwe Electronic Government Procurement System",
      bulletin_type:
        "Award Notices",
      construction_focus: true
    }
  },

  {
    id: "ZW_EGP_APP",
    country: "ZW",
    province: null,
    municipality: null,
    category: "annual_procurement_plan",
    type: "egp_html",
    endpoint:
      "https://egp.praz.org.zw/Indexes/getApp",
    enabled: false,
    confidence: 100,
    scan_frequency_minutes: 1440,
    metadata: {
      authority:
        "Procurement Regulatory Authority of Zimbabwe",
      source_name:
        "Zimbabwe Electronic Government Procurement System",
      bulletin_type:
        "Annual Procurement Plan",
      construction_focus: true,
      value_field:
        "Estimated Budget (US$)"
    }
  }
];

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const sleep = ms =>
  new Promise(resolve =>
    setTimeout(resolve, ms)
  );

function text(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const result =
    String(value)
      .replace(/\s+/g, " ")
      .trim();

  return result || null;
}

function num(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const cleaned =
    String(value)
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");

  const result = Number(cleaned);

  return Number.isFinite(result)
    ? result
    : null;
}

function date(value) {
  if (!value) {
    return null;
  }

  const raw =
    String(value).trim();

  let parsed =
    new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const match =
    raw.match(
      /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(.+)$/
    );

  if (!match) {
    return null;
  }

  parsed =
    new Date(
      `${match[1]} ${match[2]} ${match[3]} ${match[4]}`
    );

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString();
}

function sha1(value) {
  return crypto
    .createHash("sha1")
    .update(String(value))
    .digest("hex");
}

function escapeRegex(value) {
  return String(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(
      /&#(\d+);/g,
      (_, n) =>
        String.fromCharCode(Number(n))
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) =>
        String.fromCharCode(
          parseInt(n, 16)
        )
    );
}

function stripTags(value) {
  return decodeHtml(
    String(value || "")
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        ""
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        ""
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(tag, attribute) {
  const regex =
    new RegExp(
      `${attribute}\\s*=\\s*["']([^"']+)["']`,
      "i"
    );

  const match =
    String(tag || "").match(regex);

  return match
    ? decodeHtml(match[1])
    : null;
}

/* -------------------------------------------------------------------------- */
/* LINK / TABLE PARSING                                                       */
/* -------------------------------------------------------------------------- */

function findTenderLink(
  rowHtml,
  tenderId
) {
  const links =
    String(rowHtml || "").match(
      /<a\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi
    ) || [];

  for (const link of links) {
    const href =
      getAttribute(
        link,
        "href"
      );

    if (!href) {
      continue;
    }

    if (
      href.includes(
        "viewLiveTenderDetails"
      ) ||
      href.includes(
        String(tenderId)
      )
    ) {
      if (
        href.startsWith("http")
      ) {
        return href;
      }

      if (
        href.startsWith("/")
      ) {
        return `${BASE_URL}${href}`;
      }

      return `${BASE_URL}/${href}`;
    }
  }

  if (tenderId) {
    return (
      `${BASE_URL}/Indexes/viewLiveTenderDetails/` +
      encodeURIComponent(tenderId)
    );
  }

  return null;
}

function parseTableRows(html) {
  const rows = [];

  const rowMatches =
    String(html || "").match(
      /<tr\b[\s\S]*?<\/tr>/gi
    ) || [];

  for (const rowHtml of rowMatches) {
    const cells =
      rowHtml.match(
        /<(?:td|th)\b[^>]*>[\s\S]*?<\/(?:td|th)>/gi
      ) || [];

    const values =
      cells.map(cell =>
        stripTags(cell)
      );

    if (values.length < 4) {
      continue;
    }

    const joined =
      values.join(" | ");

    if (
      /Tender Id/i.test(
        values[0] || ""
      ) &&
      /Tender Title/i.test(
        joined
      )
    ) {
      continue;
    }

    rows.push({
      html: rowHtml,
      values
    });
  }

  return rows;
}

function normalizeTenderListRow(row) {
  const values =
    row.values || [];

  const tenderId =
    text(values[0]);

  const reference =
    text(values[1]);

  const title =
    text(values[2]);

  const categoryCode =
    text(values[3]);

  const categoryName =
    text(values[4]);

  const entity =
    text(values[5]);

  const scope =
    text(values[6]);

  const publishDate =
    date(values[7]);

  const closingDate =
    date(values[8]);

  return {
    external_id:
      tenderId ||
      sha1(
        `${reference}|${title}|${entity}`
      ),

    tender_id:
      tenderId,

    tender_reference:
      reference,

    title,

    supplier_category_code:
      categoryCode,

    supplier_category_name:
      categoryName,

    procuring_entity:
      entity,

    scope,

    publish_date:
      publishDate,

    closing_date:
      closingDate,

    source_record_url:
      findTenderLink(
        row.html,
        tenderId
      ),

    raw_list_row:
      values
  };
}

/* -------------------------------------------------------------------------- */
/* CONSTRUCTION DETECTION                                                     */
/* -------------------------------------------------------------------------- */

const CONSTRUCTION_PATTERNS = [
  /construction/i,
  /building/i,
  /civil works/i,
  /road/i,
  /bridge/i,
  /dam/i,
  /drainage/i,
  /storm.?water/i,
  /water infrastructure/i,
  /borehole/i,
  /sewer/i,
  /pipeline/i,
  /roof/i,
  /renovation/i,
  /refurbishment/i,
  /rehabilitation/i,
  /maintenance/i,
  /electrical installation/i,
  /substation/i,
  /transformer/i,
  /power station/i,
  /solar/i,
  /structural/i,
  /steel fabrication/i,
  /fire station/i,
  /hospital/i,
  /school/i,
  /warehouse/i,
  /depot/i,
  /airport/i,
  /industrial/i,
  /plant/i
];

function isConstructionOpportunity(
  record
) {
  const sourceText =
    [
      record.title,
      record.supplier_category_name,
      record.procuring_entity,
      record.scope
    ]
      .filter(Boolean)
      .join(" ");

  return CONSTRUCTION_PATTERNS.some(
    pattern =>
      pattern.test(sourceText)
  );
}

/* -------------------------------------------------------------------------- */
/* PROJECT CLASSIFICATION                                                     */
/* -------------------------------------------------------------------------- */

function classifyProject(record) {
  const s =
    [
      record.title,
      record.supplier_category_name,
      record.scope
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  if (
    /road|bridge|dam|drainage|storm.?water|civil works|pipeline/.test(
      s
    )
  ) {
    return "civil_infrastructure";
  }

  if (
    /building|school|hospital|office|warehouse|depot|fire station|roof|renovation|refurbishment/.test(
      s
    )
  ) {
    return "building";
  }

  if (
    /transformer|substation|electrical|power station|generator|solar|energy/.test(
      s
    )
  ) {
    return "energy_electrical";
  }

  if (
    /borehole|water|sewer|irrigation|water meter/.test(
      s
    )
  ) {
    return "water_infrastructure";
  }

  if (
    /mine|mining|mineral/.test(
      s
    )
  ) {
    return "mining";
  }

  if (
    /steel|structural|fabrication/.test(
      s
    )
  ) {
    return "structural_steel";
  }

  return "construction_related";
}

/* -------------------------------------------------------------------------- */
/* VALUE ESTIMATION                                                           */
/* -------------------------------------------------------------------------- */

function estimateValue(record) {
  const s =
    [
      record.title,
      record.supplier_category_name,
      record.scope
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  if (
    /road|bridge|dam|major pipeline/.test(s)
  ) {
    return {
      min: 250000,
      max: 25000000,
      currency: "USD"
    };
  }

  if (
    /transformer|substation|power station|major electrical/.test(
      s
    )
  ) {
    return {
      min: 500000,
      max: 50000000,
      currency: "USD"
    };
  }

  if (
    /hospital|airport|industrial|warehouse|large building/.test(
      s
    )
  ) {
    return {
      min: 500000,
      max: 25000000,
      currency: "USD"
    };
  }

  if (
    /building|school|roof|renovation|refurbishment/.test(
      s
    )
  ) {
    return {
      min: 50000,
      max: 5000000,
      currency: "USD"
    };
  }

  if (
    /borehole|water|drainage|sewer/.test(s)
  ) {
    return {
      min: 100000,
      max: 10000000,
      currency: "USD"
    };
  }

  return {
    min: 50000,
    max: 1000000,
    currency: "USD"
  };
}

/* -------------------------------------------------------------------------- */
/* OPPORTUNITY SCORING                                                        */
/* -------------------------------------------------------------------------- */

function opportunityScore(record) {
  const s =
    [
      record.title,
      record.supplier_category_name,
      record.procuring_entity,
      record.scope,
      record.project_type
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  let score = 35;

  if (
    /construction|civil works|building|road|bridge|dam/.test(
      s
    )
  ) {
    score += 20;
  }

  if (
    /infrastructure|pipeline|drainage|water|borehole/.test(
      s
    )
  ) {
    score += 10;
  }

  if (
    /power|transformer|substation|solar|electrical/.test(
      s
    )
  ) {
    score += 10;
  }

  if (
    /hospital|airport|industrial|warehouse|depot/.test(
      s
    )
  ) {
    score += 8;
  }

  if (
    /renovation|rehabilitation|refurbishment|repair/.test(
      s
    )
  ) {
    score += 5;
  }

  if (record.closing_date) {
    const closing =
      new Date(
        record.closing_date
      );

    const days =
      Math.ceil(
        (
          closing.getTime() -
          Date.now()
        ) / 86400000
      );

    if (
      days >= 0 &&
      days <= 14
    ) {
      score += 7;
    }
  }

  score =
    Math.min(
      100,
      Math.max(0, score)
    );

  const tier =
    score >= 80
      ? "HIGH"
      : score >= 60
        ? "MEDIUM"
        : "LOW";

  const probability =
    Math.min(
      0.98,
      Math.max(
        0.25,
        score / 100
      )
    );

  const base =
    Math.round(
      score * 0.82
    );

  const tradeScore =
    pattern =>
      Math.min(
        100,
        base +
          (
            new RegExp(
              pattern,
              "i"
            ).test(s)
              ? 12
              : 0
          )
      );

  const electrical =
    tradeScore(
      "electrical|power|energy|transformer|substation"
    );

  const plumbing =
    tradeScore(
      "plumbing|water|sewer|borehole|drainage"
    );

  const civil =
    tradeScore(
      "civil|road|bridge|dam|stormwater|infrastructure"
    );

  const structural =
    tradeScore(
      "structural|building|warehouse|industrial"
    );

  const steel =
    tradeScore(
      "steel|structural|fabrication"
    );

  const roofing =
    tradeScore(
      "roof|warehouse|building"
    );

  const fire =
    tradeScore(
      "fire|sprinkler|safety"
    );

  const hvac =
    tradeScore(
      "hvac|air.?conditioning|ventilation"
    );

  return {
    score,

    tier,

    construction_probability:
      Number(
        probability.toFixed(2)
      ),

    electrical_score:
      electrical,

    plumbing_score:
      plumbing,

    hvac_score:
      hvac,

    civil_score:
      civil,

    structural_score:
      structural,

    fire_score:
      fire,

    steel_score:
      steel,

    roofing_score:
      roofing,

    trade_matches: [
      {
        trade: "electrical",
        score: electrical
      },
      {
        trade: "plumbing",
        score: plumbing
      },
      {
        trade: "hvac",
        score: hvac
      },
      {
        trade: "civil",
        score: civil
      },
      {
        trade: "structural",
        score: structural
      },
      {
        trade: "fire",
        score: fire
      },
      {
        trade: "steel",
        score: steel
      },
      {
        trade: "roofing",
        score: roofing
      }
    ].sort(
      (a, b) =>
        b.score - a.score
    ),

    ai_summary:
      `GRIDV21 Zimbabwe opportunity score ${score}/100 (${tier}). ` +
      `Project type: ${
        record.project_type ||
        "construction-related"
      }. ` +
      `Procuring entity: ${
        record.procuring_entity ||
        "unknown"
      }.`
  };
}

/* -------------------------------------------------------------------------- */
/* DETAIL PAGE PARSING                                                        */
/* -------------------------------------------------------------------------- */

function extractLabelValue(
  html,
  label
) {
  const regex =
    new RegExp(
      `<[^>]*>\\s*${escapeRegex(
        label
      )}\\s*:?\\s*<\\/[^>]+>\\s*<[^>]*>\\s*([^<]+)`,
      "i"
    );

  const match =
    String(html || "")
      .match(regex);

  if (match) {
    return text(
      decodeHtml(
        match[1]
      )
    );
  }

  const visible =
    stripTags(html);

  const fallback =
    new RegExp(
      `${escapeRegex(label)}\\s*:?\\s*([^]{1,250}?)(?=\\s+(?:Tender|Status|Lot|Procurement|Funding|Delivery|Required|Procuring|Date|Project|Description|Published|Closing)\\b|$)`,
      "i"
    ).exec(visible);

  return fallback
    ? text(fallback[1])
    : null;
}

function parseDetailFields(html) {
  const fields = {};

  fields.tender_id =
    extractLabelValue(
      html,
      "Tender Id"
    );

  fields.status =
    extractLabelValue(
      html,
      "Status"
    );

  fields.reference =
    extractLabelValue(
      html,
      "Tender Reference Number"
    );

  fields.procurement_method =
    extractLabelValue(
      html,
      "Procurement Method"
    );

  fields.funding_source =
    extractLabelValue(
      html,
      "Funding Source"
    );

  fields.location =
    extractLabelValue(
      html,
      "Delivery/Project Location"
    );

  fields.supplier_categories =
    extractLabelValue(
      html,
      "Required Supplier Categories"
    );

  fields.entity =
    extractLabelValue(
      html,
      "Procuring Entity"
    );

  fields.project_name =
    extractLabelValue(
      html,
      "Project Name"
    );

  fields.description =
    extractLabelValue(
      html,
      "Description"
    );

  fields.published_date =
    extractLabelValue(
      html,
      "Published Date"
    );

  fields.closing_date =
    extractLabelValue(
      html,
      "Closing Date"
    );

  fields.updated_date =
    extractLabelValue(
      html,
      "Date Last updated"
    );

  return fields;
}

async function fetchTenderDetail(
  record
) {
  if (
    !record.source_record_url
  ) {
    return record;
  }

  try {
    const response =
      await axios.get(
        record.source_record_url,
        {
          timeout:
            REQUEST_TIMEOUT,

          headers: {
            "User-Agent":
              `GRIDV21-BRAIN-ZW/${VERSION}`,

            Accept:
              "text/html,application/xhtml+xml"
          }
        }
      );

    const fields =
      parseDetailFields(
        response.data
      );

    record.detail =
      fields;

    record.procuring_entity =
      fields.entity ||
      record.procuring_entity;

    record.tender_reference =
      fields.reference ||
      record.tender_reference;

    record.location =
      fields.location ||
      record.location ||
      null;

    record.supplier_category_name =
      fields.supplier_categories ||
      record.supplier_category_name;

    record.title =
      fields.project_name ||
      record.title;

    record.description =
      fields.description ||
      null;

    record.status =
      fields.status ||
      null;

    record.procurement_method =
      fields.procurement_method ||
      null;

    record.funding_source =
      fields.funding_source ||
      null;

    record.publish_date =
      date(
        fields.published_date
      ) ||
      record.publish_date;

    record.closing_date =
      date(
        fields.closing_date
      ) ||
      record.closing_date;

    record.updated_date =
      date(
        fields.updated_date
      ) ||
      record.publish_date;
  } catch (error) {
    record.detail_error =
      String(
        error.message ||
        error
      );
  }

  return record;
}

/* -------------------------------------------------------------------------- */
/* NORMALIZATION                                                              */
/* -------------------------------------------------------------------------- */

function normalizeRecord(
  source,
  tender,
  usdZarRate
) {
  const projectType =
    classifyProject(
      tender
    );

  const value =
    estimateValue(
      tender
    );

  const municipality =
    text(
      tender.location
    );

  const normalizedText =
    [
      tender.title,
      tender.description,
      tender.tender_reference,
      tender.supplier_category_name,
      tender.procuring_entity,
      tender.location,
      tender.scope,
      projectType
    ]
      .filter(Boolean)
      .join(" ");

  const rate =
    Number(
      usdZarRate ||
      DEFAULT_USD_ZAR_RATE
    );

  return {
    source_id:
      source.id,

    external_id:
      String(
        tender.external_id
      ),

    country:
      "ZW",

    province:
      null,

    municipality,

    source_category:
      source.category,

    record_type:
      source.type,

    application_type:
      tender.procurement_method,

    status:
      tender.status,

    project_type:
      projectType,

    permit_type:
      null,

    address:
      tender.location,

    suburb:
      null,

    town:
      municipality,

    erf_number:
      null,

    parcel_number:
      null,

    property_id:
      null,

    zoning:
      null,

    latitude:
      null,

    longitude:
      null,

    received_date:
      tender.publish_date,

    decision_date:
      null,

    updated_date:
      tender.updated_date ||
      tender.publish_date,

    floor_area:
      null,

    site_area:
      null,

    /*
     * GRIDV21 MODELLED VALUE.
     * NOT an official PRAZ tender value.
     */

    estimated_project_value:
      Math.round(
        (
          value.min +
          value.max
        ) / 2
      ),

    source_url:
      source.endpoint,

    source_record_url:
      tender.source_record_url,

    raw_data: {
      tender_id:
        tender.tender_id,

      tender_reference:
        tender.tender_reference,

      title:
        tender.title,

      description:
        tender.description,

      supplier_category_code:
        tender.supplier_category_code,

      supplier_category_name:
        tender.supplier_category_name,

      procuring_entity:
        tender.procuring_entity,

      scope:
        tender.scope,

      location:
        tender.location,

      procurement_method:
        tender.procurement_method,

      funding_source:
        tender.funding_source,

      publish_date:
        tender.publish_date,

      closing_date:
        tender.closing_date,

      project_type:
        projectType,

      modelled_value_min_usd:
        value.min,

      modelled_value_max_usd:
        value.max,

      modelled_value_currency:
        value.currency,

      modelled_usd_zar_rate:
        rate,

      modelled_value_min_zar:
        Math.round(
          value.min * rate
        ),

      modelled_value_max_zar:
        Math.round(
          value.max * rate
        ),

      detail:
        tender.detail ||
        null,

      detail_error:
        tender.detail_error ||
        null,

      source:
        "PRAZ eGP",

      source_authority:
        "Procurement Regulatory Authority of Zimbabwe",

      intelligence_version:
        VERSION
    },

    normalized_text:
      normalizedText
  };
}

/* -------------------------------------------------------------------------- */
/* LIVE eGP FETCH                                                             */
/* -------------------------------------------------------------------------- */

async function fetchLatestTenders(
  source
) {
  const rows = [];

  for (
    let page = 1;
    page <= MAX_PAGES;
    page++
  ) {
    const url =
      page === 1
        ? source.endpoint
        : `${BASE_URL}/index?direction=BulletinBoardLive.id&page=${page}&url=Indexes/index`;

    const response =
      await axios.get(
        url,
        {
          timeout:
            REQUEST_TIMEOUT,

          headers: {
            "User-Agent":
              `GRIDV21-BRAIN-ZW/${VERSION}`,

            Accept:
              "text/html,application/xhtml+xml"
          }
        }
      );

    const parsedRows =
      parseTableRows(
        response.data
      );

    if (!parsedRows.length) {
      break;
    }

    for (
      const row of parsedRows
    ) {
      const tender =
        normalizeTenderListRow(
          row
        );

      if (
        !tender.external_id
      ) {
        continue;
      }

      if (
        isConstructionOpportunity(
          tender
        )
      ) {
        rows.push(
          tender
        );
      }
    }

    if (
      page < MAX_PAGES
    ) {
      await sleep(
        PAGE_DELAY
      );
    }
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* DATABASE UPSERT                                                            */
/* -------------------------------------------------------------------------- */

async function upsertRecord(
  supabase,
  row
) {
  const now =
    new Date().toISOString();

  const {
    data: existing,
    error: lookupError
  } =
    await supabase
      .from(
        "acquisition_records"
      )
      .select(
        "id,raw_data,last_seen_at,first_seen_at"
      )
      .eq(
        "source_id",
        row.source_id
      )
      .eq(
        "external_id",
        row.external_id
      )
      .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }

  if (!existing) {
    const {
      data,
      error
    } =
      await supabase
        .from(
          "acquisition_records"
        )
        .insert({
          ...row,

          first_seen_at:
            now,

          last_seen_at:
            now,

          last_changed_at:
            now,

          is_new:
            true,

          is_updated:
            false
        })
        .select("id")
        .single();

    if (error) {
      throw error;
    }

    return {
      id:
        data.id,

      inserted:
        true,

      updated:
        false
    };
  }

  const changed =
    JSON.stringify(
      existing.raw_data ||
      {}
    ) !==
    JSON.stringify(
      row.raw_data ||
      {}
    );

  const updatePayload = {
    ...row,

    last_seen_at:
      now,

    is_new:
      false,

    is_updated:
      changed,

    updated_at:
      now
  };

  if (changed) {
    updatePayload.last_changed_at =
      now;
  }

  const {
    error
  } =
    await supabase
      .from(
        "acquisition_records"
      )
      .update(
        updatePayload
      )
      .eq(
        "id",
        existing.id
      );

  if (error) {
    throw error;
  }

  return {
    id:
      existing.id,

    inserted:
      false,

    updated:
      changed
  };
}

/* -------------------------------------------------------------------------- */
/* INTELLIGENCE FACTORY                                                       */
/* -------------------------------------------------------------------------- */

export function createZimbabweIntelligence({
  supabase,
  logger = console,
  usdZarRate =
    DEFAULT_USD_ZAR_RATE
} = {}) {
  if (!supabase) {
    throw new Error(
      "Zimbabwe intelligence requires Supabase client"
    );
  }

  const state = {
    running:
      false,

    lastRun:
      null,

    lastError:
      null,

    stats: {
      sources:
        0,

      succeeded:
        0,

      failed:
        0,

      fetched:
        0,

      construction:
        0,

      new:
        0,

      updated:
        0,

      high:
        0,

      medium:
        0
    }
  };

  /* ------------------------------------------------------------------------ */
  /* ENSURE SOURCES                                                           */
  /* ------------------------------------------------------------------------ */

  async function ensureSources() {
    const rows =
      ZW_SOURCE_CONFIG.map(
        source => ({
          id:
            source.id,

          country:
            "ZW",

          province:
            source.province ||
            null,

          municipality:
            source.municipality ||
            null,

          source_name:
            source.id,

          source_type:
            source.type,

          category:
            source.category,

          endpoint:
            source.endpoint,

          enabled:
            Boolean(
              source.enabled
            ),

          /*
           * CRITICAL FIX:
           * Never send NULL to this NOT NULL column.
           */
          scan_frequency_minutes:
            Number(
              source.scan_frequency_minutes ||
              360
            ),

          source_confidence:
            Number(
              source.confidence ||
              0
            ),

          metadata: {
            ...(source.metadata ||
              {}),

            version:
              VERSION
          }
        })
      );

    const {
      error
    } =
      await supabase
        .from(
          "acquisition_sources"
        )
        .upsert(
          rows,
          {
            onConflict:
              "id"
          }
        );

    if (error) {
      throw error;
    }

    return {
      ok:
        true,

      count:
        rows.length
    };
  }

  /* ------------------------------------------------------------------------ */
  /* SCAN                                                                      */
  /* ------------------------------------------------------------------------ */

  async function scan({
    sourceIds = null,
    runType = "manual"
  } = {}) {
    if (state.running) {
      return {
        ok:
          false,

        error:
          "Zimbabwe acquisition scan already running"
      };
    }

    state.running =
      true;

    state.lastError =
      null;

    const started =
      Date.now();

    const sources =
      ZW_SOURCE_CONFIG.filter(
        source =>
          source.enabled &&
          (
            !sourceIds ||
            sourceIds.includes(
              source.id
            )
          )
      );

    const stats = {
      sources:
        sources.length,

      succeeded:
        0,

      failed:
        0,

      fetched:
        0,

      construction:
        0,

      new:
        0,

      updated:
        0,

      high:
        0,

      medium:
        0
    };

    let runId =
      null;

    try {
      const run =
        await supabase
          .from(
            "acquisition_runs"
          )
          .insert({
            country:
              "ZW",

            run_type:
              runType,

            status:
              "running",

            sources_total:
              sources.length
          })
          .select("id")
          .single();

      if (
        !run.error &&
        run.data
      ) {
        runId =
          run.data.id;
      }

      /*
       * Register/update sources before
       * attempting to fetch anything.
       */
      await ensureSources();

      for (
        const source of sources
      ) {
        try {
          if (
            source.id !==
            "ZW_EGP_LATEST"
          ) {
            continue;
          }

          logger.info?.(
            `[ZW] Scanning ${source.id}`
          );

          const tenderRows =
            await fetchLatestTenders(
              source
            );

          stats.fetched +=
            tenderRows.length;

          for (
            const tender of tenderRows
          ) {
            await fetchTenderDetail(
              tender
            );

            const row =
              normalizeRecord(
                source,
                tender,
                usdZarRate
              );

            const result =
              await upsertRecord(
                supabase,
                row
              );

            if (
              result.inserted
            ) {
              stats.new++;
            } else if (
              result.updated
            ) {
              stats.updated++;
            }

            stats.construction++;

            const score =
              opportunityScore(
                tender
              );

            const {
              error:
                scoreError
            } =
              await supabase
                .from(
                  "opportunity_scores"
                )
                .upsert(
                  {
                    record_id:
                      result.id,

                    ...score,

                    estimated_project_value:
                      row.estimated_project_value,

                    source_confidence:
                      source.confidence,

                    updated_at:
                      new Date().toISOString()
                  },
                  {
                    onConflict:
                      "record_id"
                  }
                );

            if (scoreError) {
              throw scoreError;
            }

            if (
              score.tier ===
              "HIGH"
            ) {
              stats.high++;
            } else if (
              score.tier ===
              "MEDIUM"
            ) {
              stats.medium++;
            }

            await sleep(
              DETAIL_DELAY
            );
          }

          const now =
            new Date().toISOString();

          await supabase
            .from(
              "acquisition_sources"
            )
            .update({
              last_scan_at:
                now,

              last_success_at:
                now,

              last_error:
                null,

              updated_at:
                now
            })
            .eq(
              "id",
              source.id
            );

          stats.succeeded++;

          logger.info?.(
            `[ZW] ${source.id}: ${tenderRows.length} construction candidates processed`
          );
        } catch (error) {
          stats.failed++;

          const message =
            String(
              error.message ||
              error
            );

          await supabase
            .from(
              "acquisition_sources"
            )
            .update({
              last_scan_at:
                new Date().toISOString(),

              last_error:
                message,

              updated_at:
                new Date().toISOString()
            })
            .eq(
              "id",
              source.id
            );

          logger.warn?.(
            `[ZW] ${source.id}: ${message}`
          );
        }
      }

      if (runId) {
        await supabase
          .from(
            "acquisition_runs"
          )
          .update({
            status:
              "completed",

            finished_at:
              new Date().toISOString(),

            sources_succeeded:
              stats.succeeded,

            sources_failed:
              stats.failed,

            records_fetched:
              stats.fetched,

            records_new:
              stats.new,

            records_updated:
              stats.updated,

            opportunities_high:
              stats.high,

            opportunities_medium:
              stats.medium
          })
          .eq(
            "id",
            runId
          );
      }

      state.lastRun =
        new Date().toISOString();

      state.stats =
        stats;

      return {
        ok:
          true,

        version:
          VERSION,

        stats,

        duration_ms:
          Date.now() -
          started
      };
    } catch (error) {
      state.lastError =
        String(
          error.message ||
          error
        );

      if (runId) {
        await supabase
          .from(
            "acquisition_runs"
          )
          .update({
            status:
              "failed",

            finished_at:
              new Date().toISOString(),

            error_summary:
              state.lastError
          })
          .eq(
            "id",
            runId
          );
      }

      return {
        ok:
          false,

        error:
          state.lastError,

        stats
      };
    } finally {
      state.running =
        false;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* OPPORTUNITIES                                                             */
  /* ------------------------------------------------------------------------ */

  async function opportunities({
    limit = 50,
    minScore = 0,
    tier = null
  } = {}) {
    let query =
      supabase
        .from(
          "v_gridv21_zw_opportunities"
        )
        .select("*")
        .gte(
          "score",
          minScore
        )
        .order(
          "score",
          {
            ascending:
              false
          }
        )
        .limit(
          Math.min(
            Number(limit) || 50,
            200
          )
        );

    if (tier) {
      query =
        query.eq(
          "tier",
          tier
        );
    }

    const {
      data,
      error
    } =
      await query;

    if (error) {
      throw error;
    }

    return data || [];
  }

  /* ------------------------------------------------------------------------ */
  /* PUBLIC API                                                                */
  /* ------------------------------------------------------------------------ */

  return {
    version:
      VERSION,

    state,

    sources:
      ZW_SOURCE_CONFIG,

    ensureSources,

    scan,

    opportunities
  };
    }
