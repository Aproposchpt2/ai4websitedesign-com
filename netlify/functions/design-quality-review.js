// AI4 Design Studio — Sandbox Quality Review Function
// Rule-based quality gate for purpose/design-system fit before preview approval.

const { designSystems, getPurposeToSystemMap } = require("../../design-systems.js");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value || "{}");
  } catch (_) {
    return fallback;
  }
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toId(name = "") {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function reviewDesign(input) {
  const purposeMap = getPurposeToSystemMap();
  const purpose = clean(input.websitePurpose || input.purposeCategory);
  const goal = clean(input.primaryGoal);
  const systemName = clean(input.recommendedDesignSystem);
  const systemId = toId(systemName);
  const sections = Array.isArray(input.sectionPlan || input.sectionsNeeded) ? (input.sectionPlan || input.sectionsNeeded) : [];
  const cta = clean(input.mainCallToAction || input.ctaStrategy);
  const creativeDirection = clean(input.creativeDirection);
  const visualIdentity = input.visualIdentity && typeof input.visualIdentity === "object" ? input.visualIdentity : {};
  const flags = [];
  const recommendations = [];
  let score = 70;

  if (!purpose) {
    flags.push("Website purpose is missing.");
  } else {
    score += 5;
  }

  if (!systemName) {
    flags.push("Recommended design system is missing.");
  } else {
    score += 5;
  }

  if (purpose && systemName) {
    const expectedIds = purposeMap[purpose] || [];
    if (expectedIds.length && expectedIds.includes(systemId)) {
      score += 8;
    } else if (expectedIds.length) {
      flags.push(`Design system may not be the strongest fit for ${purpose}.`);
      recommendations.push(`Consider ${expectedIds.map((id) => designSystems[id]?.name).filter(Boolean).join(" or ")} for this purpose.`);
      score -= 4;
    }
  }

  if (sections.length >= 5) {
    score += 5;
  } else {
    flags.push("The section plan is too thin for a confident preview.");
    recommendations.push("Include at least five purposeful sections before preview.");
    score -= 6;
  }

  if (cta) {
    score += 4;
  } else {
    flags.push("Primary CTA is missing.");
    recommendations.push("Add a CTA that matches the selected goal.");
    score -= 6;
  }

  if (creativeDirection.length >= 120) {
    score += 5;
  } else {
    flags.push("Creative direction is too generic.");
    recommendations.push("Add a more specific visual and emotional direction.");
    score -= 8;
  }

  if (visualIdentity.visualMotif || visualIdentity.layoutRhythm) {
    score += 5;
  } else {
    flags.push("Visual identity needs a defined motif or layout rhythm.");
    recommendations.push("Define a visual motif so this does not feel like a basic template.");
    score -= 8;
  }

  if (goal && cta && cta.toLowerCase().includes(goal.toLowerCase().slice(0, 6))) {
    score += 2;
  }

  score = Math.max(40, Math.min(100, score));

  let status = "approved";
  if (score < 60) status = "reject";
  else if (score < 75) status = "redesign";
  else if (score < 90) status = "needs_polish";

  if (status !== "approved") {
    recommendations.push("This design direction needs refinement before customer preview.");
  }

  return { score, status, flags, recommendations };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const input = safeJsonParse(event.body, {});
  const review = reviewDesign(input);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(review)
  };
};

exports._private = { reviewDesign };
