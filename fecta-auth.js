import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = window.FECTA_SUPABASE_URL;
const supabaseKey = window.FECTA_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// EMAIL — CREATE ACCOUNT
export async function signUpWithEmail(email, password, fullName = "") {
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName
      }
    }
  });
}

// EMAIL — SIGN IN
export async function signInWithEmail(email, password) {
  return await supabase.auth.signInWithPassword({
    email,
    password
  });
}

// GOOGLE — SIGN IN
export async function signInWithGoogle() {
  return await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo: new URL("./onboarding.html", window.location.href).href
    }
  });
}

// SIGN OUT
export async function signOut() {
  return await supabase.auth.signOut();
}

// GET CURRENT USER
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

// GET FECTA PROFILE
export async function getProfile() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// SAVE FIRST-TIME FECTA SETUP
export async function saveOnboarding(payload) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  // Update member profile
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name:
        payload.displayName ||
        user.user_metadata?.full_name ||
        "",
      age_range: payload.ageRange,
      community: payload.community,
      ai_mode: payload.aiMode,
      privacy_mode: payload.privacyMode,
      updated_at: new Date().toISOString()
    })
    .eq("id", user.id);

  if (profileError) {
    throw profileError;
  }

  // Find selected interests
  if (payload.interests?.length) {
    const { data: interests, error: interestError } =
      await supabase
        .from("interests")
        .select("id,name")
        .in("name", payload.interests);

    if (interestError) {
      throw interestError;
    }

    // Clear previous selections
    const { error: deleteError } = await supabase
      .from("profile_interests")
      .delete()
      .eq("profile_id", user.id);

    if (deleteError) {
      throw deleteError;
    }

    // Save new selections
    if (interests?.length) {
      const rows = interests.map((interest) => ({
        profile_id: user.id,
        interest_id: interest.id
      }));

      const { error: insertError } = await supabase
        .from("profile_interests")
        .insert(rows);

      if (insertError) {
        throw insertError;
      }
    }
  }

  // Close previous active path
  const { error: oldPathError } = await supabase
    .from("personal_paths")
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq("profile_id", user.id)
    .eq("is_active", true);

  if (oldPathError) {
    throw oldPathError;
  }

  // Create new active path
  const { error: pathError } = await supabase
    .from("personal_paths")
    .insert({
      profile_id: user.id,
      direction: payload.direction,
      current_focus: payload.direction,
      current_stage: "discover",
      is_active: true
    });

  if (pathError) {
    throw pathError;
  }

  return true;
}

// LOAD PERSONAL + MY PATH
export async function loadMemberHome() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [
    profileResult,
    pathResult,
    goalsResult,
    achievementsResult
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single(),

    supabase
      .from("personal_paths")
      .select("*")
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .maybeSingle(),

    supabase
      .from("goals")
      .select("*")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .order("created_at", {
        ascending: false
      }),

    supabase
      .from("achievements")
      .select("*")
      .eq("profile_id", user.id)
      .order("unlocked_at", {
        ascending: false
      })
      .limit(5)
  ]);

  const errors = [
    profileResult.error,
    pathResult.error,
    goalsResult.error,
    achievementsResult.error
  ].filter(Boolean);

  if (errors.length) {
    throw errors[0];
  }

  return {
    profile: profileResult.data,
    path: pathResult.data,
    goals: goalsResult.data || [],
    achievements: achievementsResult.data || []
  };
}

// WATCH LOGIN STATE
export function watchAuth(callback) {
  return supabase.auth.onAuthStateChange(
    (_event, session) => {
      callback(session);
    }
  );
}
