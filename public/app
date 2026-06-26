let loading = false;

function addEvent(text) {

  const events =
    document.getElementById('events');

  if (!events) return;

  const div = document.createElement('div');

  div.className = 'activity-item';

  div.innerHTML =
    `${text}
    <small>
    ${new Date().toLocaleTimeString()}
    </small>`;

  events.prepend(div);
}

async function loadDashboard() {

  if (loading) return;

  loading = true;

  try {

    const response =
      await fetch('/api/dashboard');

    const data =
      await response.json();

    if (!data.success)
      throw new Error();

    document.getElementById(
      'total_leads'
    ).textContent =
      data.metrics.total_leads || 0;

    document.getElementById(
      'revenue'
    ).textContent =
      '$' +
      Number(
        data.metrics.est_revenue_month || 0
      ).toLocaleString();

    document.getElementById(
      'dms'
    ).textContent =
      data.metrics.dms_sent || 0;

    document.getElementById(
      'os_count'
    ).textContent =
      (data.metrics.os_active || 0)
      + '/12';

    const feed =
      document.getElementById(
        'permitFeed'
      );

    if (data.permits.length) {

      feed.innerHTML =
        data.permits.map(p => `

          <div class="permit-row">

            <div>
              <b>${p.city}</b><br>
              ${p.permit_type}
            </div>

          </div>

        `).join('');

    } else {

      feed.innerHTML =
        'No permits available';
    }

    const os =
      document.getElementById('modalOS');

    if (os) {

      os.innerHTML =
        data.osModules.map(o => `

          <button
            class="os-btn ${o.status}">

            ${o.name}

          </button>

        `).join('');
    }

    addEvent(
      'Dashboard refreshed'
    );

  } catch (e) {

    console.log(e);

    addEvent(
      'Dashboard API error'
    );

  }

  loading = false;
}

function showMenu() {

  document.getElementById(
    'menuModal'
  ).style.display = 'flex';
}

function hideMenu() {

  document.getElementById(
    'menuModal'
  ).style.display = 'none';
}

loadDashboard();

setInterval(
  loadDashboard,
  10000
);
