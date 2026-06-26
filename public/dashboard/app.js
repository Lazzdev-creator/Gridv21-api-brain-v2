import { supabase } from "./supabaseClient.js";

const authBox = document.getElementById("auth");
const panel = document.getElementById("panel");
const dataBox = document.getElementById("data");

window.signup = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  await supabase.auth.signUp({ email, password });
};

window.login = async () => {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (data.user) loadDashboard();
};

window.logout = async () => {
  await supabase.auth.signOut();
  location.reload();
};

async function loadDashboard() {
  authBox.style.display = "none";
  panel.style.display = "block";

  const { data } = await supabase.from("signals").select("*").order("created_at", { ascending: false });

  dataBox.innerHTML = data.map(d => `
    <div class="card">
      <b>${d.title}</b><br/>
      ${d.value}
    </div>
  `).join("");
                                                                  }
