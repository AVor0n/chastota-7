// Conditions and assignments of the script: a tiny safe expression language.
// Grammar: or > and > not > comparison > +/- > unary > atom; atoms are numbers, true/false, names, calls f(id), (expr).

const FUNCS = new Set(["has", "seen", "ever", "read", "ending"]);

export function tokenize(src) {
  const out = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    let m = src.slice(i).match(/^(\d+(?:\.\d+)?)/);
    if (m) { out.push({ k: "num", v: parseFloat(m[1]) }); i += m[1].length; continue; }
    m = src.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) { out.push({ k: "id", v: m[1] }); i += m[1].length; continue; }
    m = src.slice(i).match(/^(==|!=|<=|>=|<|>|\(|\)|\+|-|,|!)/);
    if (m) { out.push({ k: "op", v: m[1] }); i += m[1].length; continue; }
    throw new Error(`непонятный символ «${c}» в «${src}»`);
  }
  return out;
}

export function parseExpr(src) {
  const t = tokenize(src); let p = 0;
  const peek = () => t[p], eat = () => t[p++];
  const isWord = w => t[p] && t[p].k === "id" && t[p].v === w;
  const isOp = o => t[p] && t[p].k === "op" && t[p].v === o;
  function expect(o) { if (!isOp(o)) throw new Error(`ожидалось «${o}» в «${src}»`); p++; }
  function or() { let l = and(); while (isWord("or")) { p++; l = { k: "or", l, r: and() }; } return l; }
  function and() { let l = not(); while (isWord("and")) { p++; l = { k: "and", l, r: not() }; } return l; }
  function not() { if (isWord("not") || isOp("!")) { p++; return { k: "not", e: not() }; } return cmp(); }
  function cmp() {
    let l = add();
    while (peek() && peek().k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(peek().v)) { const o = eat().v; l = { k: "cmp", o, l, r: add() }; }
    return l;
  }
  function add() { let l = un(); while (isOp("+") || isOp("-")) { const o = eat().v; l = { k: "bin", o, l, r: un() }; } return l; }
  function un() { if (isOp("-")) { p++; return { k: "neg", e: un() }; } return atom(); }
  function atom() {
    const x = eat();
    if (!x) throw new Error(`выражение оборвалось: «${src}»`);
    if (x.k === "num") return { k: "lit", v: x.v };
    if (x.k === "op" && x.v === "(") { const e = or(); expect(")"); return e; }
    if (x.k === "id") {
      if (x.v === "true") return { k: "lit", v: true };
      if (x.v === "false") return { k: "lit", v: false };
      if (["and", "or", "not"].includes(x.v)) throw new Error(`лишнее «${x.v}» в «${src}»`);
      if (isOp("(")) {
        if (!FUNCS.has(x.v)) throw new Error(`неизвестная функция ${x.v}() в «${src}»`);
        p++; const a = eat(); if (!a || a.k !== "id") throw new Error(`в ${x.v}() нужен id в «${src}»`); expect(")");
        return { k: "call", f: x.v, a: a.v };
      }
      return { k: "var", v: x.v };
    }
    throw new Error(`неожиданное «${x.v}» в «${src}»`);
  }
  if (!t.length) throw new Error("пустое условие");
  const e = or();
  if (p < t.length) throw new Error(`лишнее «${t[p].v}» в «${src}»`);
  return e;
}

// env: { get(name), call(f, id) }
export function evalExpr(e, env) {
  switch (e.k) {
    case "lit": return e.v;
    case "var": return env.get(e.v);
    case "call": return env.call(e.f, e.a);
    case "not": return !evalExpr(e.e, env);
    case "neg": return -evalExpr(e.e, env);
    case "and": return !!(evalExpr(e.l, env) && evalExpr(e.r, env));
    case "or": return !!(evalExpr(e.l, env) || evalExpr(e.r, env));
    case "bin": { const a = +evalExpr(e.l, env), b = +evalExpr(e.r, env); return e.o === "+" ? a + b : a - b; }
    case "cmp": {
      const a = evalExpr(e.l, env), b = evalExpr(e.r, env);
      switch (e.o) { case "==": return a === b; case "!=": return a !== b; case "<": return a < b; case "<=": return a <= b; case ">": return a > b; case ">=": return a >= b; }
    }
  }
  throw new Error("bad expr");
}

// every variable name and function call used, for the checker
export function exprRefs(e, out = { vars: new Set(), calls: [] }) {
  if (!e) return out;
  if (e.k === "var") out.vars.add(e.v);
  if (e.k === "call") out.calls.push([e.f, e.a]);
  for (const k of ["e", "l", "r"]) if (e[k]) exprRefs(e[k], out);
  return out;
}
