/* GRIDV21 South Africa Construction Opportunity Intelligence - Phase 1 + Matching */
import crypto from "crypto";
import axios from "axios";

const VERSION = "6.4.1";

export const SA_SOURCE_CONFIG = [
  { id:"SA_CPT_BDM", municipality:"Cape Town", province:"Western Cape", category:"building_development", type:"arcgis", endpoint:"https://citymaps.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_11/MapServer/1", enabled:true, confidence:100 },
  { id:"SA_CPT_LAND_USE", municipality:"Cape Town", province:"Western Cape", category:"land_use", type:"arcgis", endpoint:"https://citymaps.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_11/MapServer/2", enabled:true, confidence:100 },
  { id:"SA_CPT_NEW_DEVELOPMENT", municipality:"Cape Town", province:"Western Cape", category:"development_area", type:"arcgis", endpoint:"https://citymaps.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_11/MapServer/13", enabled:true, confidence:100 },
  { id:"SA_CPT_MIXED_USE", municipality:"Cape Town", province:"Western Cape", category:"development_area", type:"arcgis", endpoint:"https://citymaps.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_11/MapServer/14", enabled:true, confidence:100 },
  { id:"SA_CPT_DEVELOPMENT_CORRIDORS", municipality:"Cape Town", province:"Western Cape", category:"development_area", type:"arcgis", endpoint:"https://citymaps.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_11/MapServer/15", enabled:true, confidence:100 },
  { id:"SA_CPT_DEVELOPMENT_FOCUS", municipality:"Cape Town", province:"Western Cape", category:"development_area", type:"arcgis", endpoint:"https://citymaps.capetown.gov.za/agsext/rest/services/Theme_Based/ODP_SPLIT_11/MapServer/16", enabled:true, confidence:100 },
  { id:"SA_EKU_ZONING", municipality:"Ekurhuleni", province:"Gauteng", category:"zoning", type:"arcgis", endpoint:"https://gis.ekurhuleni.gov.za/arcgis/rest/services/Ekurhuleni/Ekurhuleni_Propety_Data_Map/MapServer/2", enabled:true, confidence:100 },
  { id:"SA_BREED_BC_BUILDING", municipality:"Breede Valley", province:"Western Cape", category:"building_plans", type:"arcgis", endpoint:"https://arcgis.bvm.gov.za/arcgis/rest/services/Directorates/PublicServices_Internal/MapServer/13", enabled:true, confidence:100 },
  { id:"SA_BREED_LAND_USE", municipality:"Breede Valley", province:"Western Cape", category:"land_use", type:"arcgis", endpoint:"https://arcgis.bvm.gov.za/arcgis/rest/services/Directorates/PublicServices_Internal/MapServer/11", enabled:true, confidence:100 },
  { id:"SA_BREED_ZONING", municipality:"Breede Valley", province:"Western Cape", category:"zoning", type:"arcgis", endpoint:"https://arcgis.bvm.gov.za/arcgis/rest/services/Directorates/PublicServices_Internal/MapServer/51", enabled:true, confidence:100 },
  { id:"SA_ETH_BUILDING", municipality:"eThekwini", province:"KwaZulu-Natal", category:"building_approvals", type:"open_dataset", endpoint:process.env.SA_ETH_BUILDING_URL || null, enabled:Boolean(process.env.SA_ETH_BUILDING_URL), confidence:95 },
  { id:"SA_JHB_CPMS", municipality:"Johannesburg", province:"Gauteng", category:"building_permits", type:"portal", endpoint:"https://cpms.joburg.org.za/", enabled:false, confidence:90 },
  { id:"SA_TSH_NAPS", municipality:"Tshwane", province:"Gauteng", category:"building_permits", type:"portal", endpoint:null, enabled:false, confidence:90 }
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = v => v === null || v === undefined ? null : (String(v).trim() || null);
const num = v => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : null; };
const date = v => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

function pick(o, keys) { for (const k of keys) if (o?.[k] !== undefined && o?.[k] !== null && String(o[k]).trim() !== "") return o[k]; return null; }

function sha1(v) { return crypto.createHash("sha1").update(String(v)).digest("hex"); }

function opportunityScore(r) {
  const s = `${r.project_type || ""} ${r.record_type || ""} ${r.application_type || ""} ${r.permit_type || ""} ${r.status || ""} ${r.zoning || ""}`.toLowerCase();
  let score = 35;
  if (r.source_category === "building_plans" || r.source_category === "building_development" || r.source_category === "building_approvals") score += 25;
  if (r.source_category === "land_use") score += 18;
  if (r.source_category === "development_area") score += 10;
  if (r.source_category === "zoning") score += 8;
  if (/industrial|commercial|warehouse|retail|office|mixed.?use|residential development|construction|building/.test(s)) score += 15;
  if (/approved|recommend|decision|final|commencement/.test(s)) score += 8;
  if (/new development|priority|development focus|corridor|intensification/.test(s)) score += 7;
  score = Math.min(100, score);
  const tier = score >= 80 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW";
  const probability = Math.min(0.98, Math.max(0.25, score / 100));
  const base = Math.round(score * 0.82);
  const trade = k => Math.min(100, Math.max(0, base + (new RegExp(k, "i").test(s) ? 12 : 0)));
  return {
    score, tier, construction_probability: Number(probability.toFixed(2)),
    electrical_score: trade("electrical|power|energy"),
    plumbing_score: trade("plumbing|water|sewer"),
    hvac_score: trade("hvac|air.?conditioning|ventilation"),
    civil_score: trade("civil|road|stormwater|infrastructure"),
    structural_score: trade("structural|building|warehouse|industrial"),
    fire_score: trade("fire|sprinkler|safety"),
    steel_score: trade("steel|structural|warehouse|industrial"),
    roofing_score: trade("roof|warehouse|industrial"),
    trade_matches: ["electrical","plumbing","hvac","civil","structural","fire","steel","roofing"].map((tradeName, i) => ({ trade: tradeName, score: [trade("electrical|power|energy"),trade("plumbing|water|sewer"),trade("hvac|air.?conditioning|ventilation"),trade("civil|road|stormwater|infrastructure"),trade("structural|building|warehouse|industrial"),trade("fire|sprinkler|safety"),trade("steel|structural|warehouse|industrial"),trade("roof|warehouse|industrial")][i] })).sort((a,b) => b.score-a.score),
    ai_summary: `GRIDV21 SA opportunity score ${score}/100 (${tier}). Source: ${r.municipality}, ${r.source_category}.`
  };
}

function normalizeArcGIS(source, feature) {
  const a = feature?.attributes || feature || {};
  const g = feature?.geometry || {};
  const lat = num(pick(a,["latitude","LATITUDE","lat"])) ?? num(g.y);
  const lon = num(pick(a,["longitude","LONGITUDE","lon","lng"])) ?? num(g.x);
  const externalId = text(pick(a,["SL_PSRM_CASE_KEY","OBJECTID","OBJECTID_1","FID","id","ID","PARCEL_ID","ERF_NO","ERF_NUMBER"])) || sha1(JSON.stringify(a));
  const applicationType = text(pick(a,["CASE_TYPE","case_type","APPLICATION_TYPE","TYPE"]));
  const status = text(pick(a,["CASE_STS","status","STATUS","RECOMMENDATION","DECISION"]));
  const zoning = text(pick(a,["ZONING","zoning","ZONE","LAND_USE"]));
  const address = text(pick(a,["ADDRESS","SITE_ADDRESS","STREET_ADDRESS","PROPERTY_ADDRESS","ADDRESS_LINE1"]));
  const suburb = text(pick(a,["SUBURB","SUBURB_NAME","SUBURBNAME"]));
  const town = text(pick(a,["TOWN","TOWN_NAME","CITY","MUNICIPALITY"]));
  const erf = text(pick(a,["ERF","ERF_NO","ERF_NUMBER","ERFNUM"]));
  const parcel = text(pick(a,["SL_LAND_PRCL_SG_KEY","PARCEL","PARCEL_NO","PARCEL_NUMBER"]));
  const updated = date(pick(a,["UPD_DATE","UPDATED_DATE","UPDATE_DATE","DATE_UPDATED","DATE_RECEIVED","RECEIVED_DATE"]));
  const projectType = text(pick(a,["CASE_CAT","PROJECT_TYPE","DEVELOPMENT_TYPE","TYPE","DSCR"]));
  return {
    source_id: source.id, external_id: String(externalId), country:"ZA", province:source.province, municipality:source.municipality,
    source_category:source.category, record_type:source.type, application_type:applicationType, status, project_type:projectType,
    permit_type: source.category.includes("building") ? projectType || "Building-related" : null, address, suburb, town,
    erf_number:erf, parcel_number:parcel, property_id:parcel || erf, zoning, latitude:lat, longitude:lon,
    received_date:updated, decision_date:null, updated_date:updated, floor_area:num(pick(a,["FLOOR_AREA","FLOORAREA","AREA_M2","AREA"])),
    site_area:num(pick(a,["SITE_AREA","AREA_HA","AREA_HCTR"])), estimated_project_value:num(pick(a,["ESTIMATED_VALUE","PROJECT_VALUE","VALUE","VALUATION"])),
    source_url:source.endpoint, source_record_url: source.endpoint ? `${source.endpoint}/query?where=OBJECTID%3D${encodeURIComponent(a.OBJECTID ?? externalId)}&outFields=*&f=pjson` : null,
    raw_data:a, normalized_text:`${projectType||""} ${applicationType||""} ${status||""} ${zoning||""} ${address||""}`.trim()
  };
}

async function fetchArcGIS(source, {limit=2000, maxPages=25, timeout=30000}={}) {
  const rows=[];
  let offset=0;
  for (let page=0; page<maxPages; page++) {
    const url = `${source.endpoint}/query`;
    const {data} = await axios.get(url, { params:{ where:"1=1", outFields:"*", returnGeometry:true, f:"json", resultOffset:offset, resultRecordCount:limit, orderByFields:"OBJECTID ASC" }, timeout, headers:{"User-Agent":`GRIDV21-BRAIN/${VERSION}`,Accept:"application/json"} });
    const features=data?.features || [];
    rows.push(...features.map(f=>normalizeArcGIS(source,f)));
    if (features.length < limit) break;
    offset += features.length;
    await sleep(250);
  }
  return rows;
}

async function fetchGenericJSON(source, {timeout=30000}={}) {
  if (!source.endpoint) return [];
  const {data} = await axios.get(source.endpoint,{timeout,headers:{"User-Agent":`GRIDV21-BRAIN/${VERSION}`,Accept:"application/json,text/csv,*/*"}});
  const rows = Array.isArray(data) ? data : (data?.data || data?.results || data?.features || []);
  return rows.map((row)=>normalizeArcGIS(source,{attributes:row,geometry:row.geometry||{}})).filter(r => r.external_id);
}

async function upsertRecord(supabase, row) {
  const now = new Date().toISOString();
  const {data: existing, error: lookupError} = await supabase.from("acquisition_records").select("id,raw_data,last_seen_at,first_seen_at").eq("source_id",row.source_id).eq("external_id",row.external_id).maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) {
    const {data, error} = await supabase.from("acquisition_records").insert({...row,first_seen_at:now,last_seen_at:now,last_changed_at:now,is_new:true,is_updated:false}).select("id").single();
    if (error) throw error;
    return {id:data.id,inserted:true,updated:false};
  }
  const changed = JSON.stringify(existing.raw_data||{}) !== JSON.stringify(row.raw_data||{});
  const {error} = await supabase.from("acquisition_records").update({...row,last_seen_at:now,last_changed_at:changed?now:undefined,is_new:false,is_updated:changed,updated_at:now}).eq("id",existing.id);
  if (error) throw error;
  return {id:existing.id,inserted:false,updated:changed};
}

export function createSouthAfricaIntelligence({supabase, logger=console}) {
  const state = {running:false,lastRun:null,lastError:null,stats:{sources:0,succeeded:0,failed:0,fetched:0,new:0,updated:0,high:0,medium:0}};

  async function ensureSources() {
    const rows=SA_SOURCE_CONFIG.map(s=>({id:s.id,country:"ZA",province:s.province,municipality:s.municipality,source_name:s.id,source_type:s.type,category:s.category,endpoint:s.endpoint,enabled:s.enabled,scan_frequency_minutes:s.category.includes("development_area")||s.category==="zoning"?360:60,source_confidence:s.confidence,metadata:{phase:1}}));
    const {error}=await supabase.from("acquisition_sources").upsert(rows,{onConflict:"id"});
    if(error) throw error;
  }

  async function scan({sourceIds=null,runType="manual"}={}) {
    if(state.running) return {ok:false,error:"South Africa acquisition scan already running"};
    state.running=true; state.lastError=null;
    const started=Date.now();
    const sources=SA_SOURCE_CONFIG.filter(s=>s.enabled && (!sourceIds || sourceIds.includes(s.id)));
    const stats={sources:sources.length,succeeded:0,failed:0,fetched:0,new:0,updated:0,high:0,medium:0};
    let runId=null;
    try {
      const run=await supabase.from("acquisition_runs").insert({country:"ZA",run_type:runType,status:"running",sources_total:sources.length}).select("id").single();
      if(!run.error) runId=run.data.id;
      await ensureSources();
      for(const source of sources){
        try {
          const rows=source.type==="arcgis" ? await fetchArcGIS(source) : await fetchGenericJSON(source);
          stats.fetched += rows.length;
          for(const row of rows){
            const result=await upsertRecord(supabase,row);
            if(result.inserted) stats.new++; else if(result.updated) stats.updated++;
            const score=opportunityScore(row);
            const {error}=await supabase.from("opportunity_scores").upsert({record_id:result.id,...score,estimated_project_value:row.estimated_project_value,source_confidence:source.confidence,updated_at:new Date().toISOString()},{onConflict:"record_id"});
            if(error) throw error;
            if(score.tier==="HIGH") stats.high++; else if(score.tier==="MEDIUM") stats.medium++;
          }
          await supabase.from("acquisition_sources").update({last_scan_at:new Date().toISOString(),last_success_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()}).eq("id",source.id);
          stats.succeeded++;
        } catch(error){
          stats.failed++;
          await supabase.from("acquisition_sources").update({last_scan_at:new Date().toISOString(),last_error:String(error.message||error),updated_at:new Date().toISOString()}).eq("id",source.id);
          logger.warn?.(`[SA] ${source.id}: ${error.message}`);
        }
      }
      if(runId) await supabase.from("acquisition_runs").update({status:"completed",finished_at:new Date().toISOString(),sources_succeeded:stats.succeeded,sources_failed:stats.failed,records_fetched:stats.fetched,records_new:stats.new,records_updated:stats.updated,opportunities_high:stats.high,opportunities_medium:stats.medium}).eq("id",runId);
      state.lastRun=new Date().toISOString(); state.stats=stats;
      return {ok:true,version:VERSION,stats,duration_ms:Date.now()-started};
    } catch(error){
      state.lastError=String(error.message||error);
      if(runId) await supabase.from("acquisition_runs").update({status:"failed",finished_at:new Date().toISOString(),error_summary:state.lastError});
      return {ok:false,error:state.lastError,stats};
    } finally { state.running=false; }
  }

  async function opportunities({limit=50,minScore=0,municipality=null,tier=null}={}) {
    let q=supabase.from("v_gridv21_sa_opportunities").select("*").gte("score",minScore).order("score",{ascending:false}).limit(Math.min(Number(limit)||50,200));
    if(municipality) q=q.eq("municipality",municipality);
    if(tier) q=q.eq("tier",tier);
    const {data,error}=await q;
    if(error) throw error;
    return data||[];
  }

  async function tenantOpportunities(tenantId, {limit=25}={}) {
    const {data: matches, error: matchError} = await supabase
      .from("tenant_opportunity_matches")
      .select("record_id,match_score,reason,status,created_at")
      .eq("tenant_id", tenantId)
      .order("match_score", {ascending:false})
      .limit(Math.min(Number(limit)||25,100));
    if (matchError) throw matchError;
    if (!matches?.length) return [];
    const ids = matches.map(m => m.record_id);
    const {data: records, error: recordError} = await supabase
      .from("v_gridv21_sa_opportunities")
      .select("*")
      .in("id", ids);
    if (recordError) throw recordError;
    const byId = new Map((records||[]).map(r => [r.id, r]));
    return matches.map(m => ({...byId.get(m.record_id), match_score:m.match_score, match_reason:m.reason, match_status:m.status, matched_at:m.created_at})).filter(Boolean);
  }

  /**
   * Basic auto-matching: push HIGH + MEDIUM opportunities to all active tenants
   * (or a specific tenant). Creates rows in tenant_opportunity_matches.
   * Idempotent via unique (tenant_id, record_id).
   */
  async function matchOpportunitiesToTenants({
    tenantIds = null,
    minScore = 60,
    limitPerTenant = 40,
    reason = "auto_high_score"
  } = {}) {
    let tenants = [];
    if (Array.isArray(tenantIds) && tenantIds.length) {
      tenants = tenantIds.map(id => ({ id }));
    } else {
      const { data, error } = await supabase
        .from("tenants")
        .select("id")
        .eq("status", "active")
        .limit(500);
      if (error) {
        logger.warn?.(`[SA] match: tenants table unavailable (${error.message}). Provide tenantIds explicitly.`);
        return { ok: false, error: "No tenants resolved. Pass tenant_ids or create a tenants table.", matched: 0 };
      }
      tenants = data || [];
    }

    if (!tenants.length) {
      return { ok: true, matched: 0, message: "No tenants to match" };
    }

    const opps = await opportunities({ limit: 200, minScore });
    if (!opps.length) {
      return { ok: true, matched: 0, message: "No opportunities above minScore" };
    }

    let totalMatched = 0;
    const now = new Date().toISOString();

    for (const tenant of tenants) {
      const rows = opps.slice(0, limitPerTenant).map(o => ({
        tenant_id: tenant.id,
        record_id: o.id,
        match_score: o.score,
        reason: `${reason} (tier=${o.tier})`,
        status: "new",
        created_at: now,
        updated_at: now
      }));

      const { error } = await supabase
        .from("tenant_opportunity_matches")
        .upsert(rows, { onConflict: "tenant_id,record_id", ignoreDuplicates: false });

      if (error) {
        logger.warn?.(`[SA] match tenant ${tenant.id}: ${error.message}`);
        continue;
      }
      totalMatched += rows.length;
    }

    return {
      ok: true,
      matched: totalMatched,
      tenants: tenants.length,
      opportunities_considered: opps.length,
      minScore
    };
  }

  return {
    version: VERSION,
    state,
    ensureSources,
    scan,
    opportunities,
    tenantOpportunities,
    matchOpportunitiesToTenants,
    sources: SA_SOURCE_CONFIG
  };
    }
