const BLOCKED_PATTERNS = [
  /n[i1]g+[e3]r/i, /n[i1]g+[a4]/i, /f[a4]g+[o0]t/i, /r[e3]t[a4]rd/i,
  /p[e3]d[o0]/i, /r[a4]p[e3]/i, /s[u\xfc]ic[i1]d/i, /k[i1]ll\s*(your|ur)self/i,
  /n[a4]z[i1]/i, /h[i1]tl[e3]r/i, /g[a4]s\s*th[e3]/i, /wh[i1]t[e3]\s*p[o0]w[e3]r/i,
  /j[i1]h[a4]d/i, /t[e3]rr[o0]r[i1]s/i,
  /p[u\xfc]t[a4][i1]n/i, /enc[u\xfc]l[e3\xe9]/i, /n[e3\xe8]gr[e3]/i, /s[a4]l[o0]p[e3]/i,
  /b[a4]t[a4]rd/i, /c[o0]nn[a4]rd/i,
];

export function containsBlockedWord(text) {
  if (!text) return false;
  const normalized = text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return BLOCKED_PATTERNS.some(p => p.test(normalized));
}

export function sanitizeMessage(text) {
  if (!text) return "";
  return text.trim().slice(0, 2000);
}
