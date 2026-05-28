import { supabaseAdmin, supabaseConfigured } from "./supabaseClient.js";

const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@student.local",
  user_metadata: {
    full_name: "Demo Student"
  }
};

export async function requireUser(req, res, next) {
  if (!supabaseConfigured) {
    req.user = DEMO_USER;
    req.authMode = "demo";
    next();
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Supabase access token." });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: "Invalid or expired Supabase access token." });
    return;
  }

  req.user = data.user;
  req.authMode = "supabase";
  next();
}

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}
