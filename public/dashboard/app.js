import { supabase } from "./supabaseClient.js";

const authBox = document.getElementById("auth");
const panel = document.getElementById("panel");
const dataBox = document.getElementById("data");

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function getUserRole(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  return data?.role;
}

async function boot() {
  const session = await getSession();

  if (!session) {
    showAuth();
    return;
  }

  const role = await getUserRole(session.user.id);

  if (role !== "admin") {
    showDenied();
    return;
  }

  loadDashboard();
}

function showAuth() {
  authBox.style.display = "block";
  panel.style.display = "none";
}

function showDenied() {
  document.body.innerHTML = "<h2>Access Denied</h2>";
}

async function loadDashboard() {
  authBox.style.display = "none";
  panel.style.display = "block";

  const { data } = await supabase
    .from("signals")
    .select("*")
    .order("created_at", { ascending: false });

  dataBox.innerHTML = data.map(i => `
    <div class="card">
      <b>${i.title}</b><br/>
      ${i.value}
    </div>
  `).join("");
}

/* AUTH ACTIONS */

window.login = async () => {
  const email = emailInput().value;
  const password = passwordInput().value;

  await supabase.auth.signInWithPassword({ email, password });
  location.reload();
};

window.signup = async () => {
  const email = emailInput().value;
  const password = passwordInput().value;

  await supabase.auth.signUp({ email, password });
};

window.logout = async () => {
  await supabase.auth.signOut();
  location.reload();
};

function emailInput() {
  return document.getElementById("email");
}

function passwordInput() {
  return document.getElementById("password");
}

boot();
