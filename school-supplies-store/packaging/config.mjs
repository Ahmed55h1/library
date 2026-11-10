export function releaseEnvironment(env) {
  const origin = (value) => {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      !u.hostname ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash ||
      /[\r\n]/.test(value)
    )
      throw new Error(
        "Use exact HTTPS origins without credentials, paths, or wildcards.",
      );
    if (
      u.hostname.includes("*") ||
      u.hostname.endsWith(".invalid") ||
      u.hostname.endsWith(".test") ||
      u.hostname === "localhost"
    )
      throw new Error("A real approved private HTTPS origin is required.");
    return u.origin;
  };
  if (!env.MAKTABATI_STORE_URL || !env.MAKTABATI_APPROVED_ORIGINS)
    throw new Error(
      "Set MAKTABATI_STORE_URL and MAKTABATI_APPROVED_ORIGINS to the approved private HTTPS origins.",
    );
  const store = origin(env.MAKTABATI_STORE_URL);
  const approved = env.MAKTABATI_APPROVED_ORIGINS.split(",").map((v) =>
    origin(v.trim()),
  );
  if (!approved.includes(store))
    throw new Error("Store origin is not approved.");
  return {
    ...env,
    MAKTABATI_STORE_URL: store + "/",
    MAKTABATI_APPROVED_ORIGINS: approved.join(","),
  };
}
