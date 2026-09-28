import { describe, it, expect } from "vitest";
import { applyFaceHints, currentHints, type FaceHint } from "../src/core/vision/FaceEvidence";
import { alignmentTransform, decodeYuNet, headRegion, pickSubjectFace, quality, flipAverage, cosine, TEMPLATE, type DetectedFace } from "../src/core/vision/FaceGeometry";
import { Identify } from "../src/core/vision/Identify";
import { Team, Player } from "../src/core/roster/Roster";
import type { Observation, Subject } from "../src/core/vision/Observation";

const ogbechie = Player.make({ number: "14", firstName: "Manaia", lastName: "Ogbechie" });
const jackson = Player.make({ number: "15", firstName: "Andi", lastName: "Jackson" });
const reilly = Player.make({ number: "2", firstName: "Bergen", lastName: "Reilly" });
const taylor = Player.make({ number: "21", firstName: "Jackie", lastName: "Taylor" });
const matchup = { a: Team.make({ school: "Nebraska", players: [ogbechie, jackson, reilly] }), b: Team.make({ school: "North Carolina", players: [taylor] }) };
const subj = (x: Partial<Subject>): Subject => ({ id: "P1", kind: "athlete", team: "A", number: "", numberOn: "none", clarity: "hidden", player: "", role: "", uniformText: "", box: [0, 0, 10, 10], ...x });
const hint = (p: Player, score: number, good = true): FaceHint => ({ playerID: p.id, score, good });
const run = (subjects: Subject[], hints: Record<string, FaceHint[]>) => {
  const obs: Observation = { scene: "celebration", timing: "during", clause: "{P1} celebrates", subjects };
  return applyFaceHints(Identify.all(obs, { matchup, unitSport: false }), obs, hints, matchup);
};

describe("what a face match may do", () => {
  it("names an athlete with no visible number when the match is strong and clear, as likely only", () => {
    const [id] = run([subj({})], { P1: [hint(ogbechie, 0.52), hint(jackson, 0.31)] });
    expect(id).toMatchObject({ status: "likely", source: "face", teamKey: "A" });
    expect(id.player?.lastName).toBe("Ogbechie");
  });

  it("leaves a weak, crowded or poorly seen match to the photographer", () => {
    expect(run([subj({})], { P1: [hint(ogbechie, 0.44)] })[0].player).toBeNull();
    expect(run([subj({})], { P1: [hint(ogbechie, 0.52), hint(jackson, 0.47)] })[0].player).toBeNull();
    // A small or turned face never names anyone unasked, however high it scores.
    expect(run([subj({})], { P1: [hint(ogbechie, 0.55, false)] })[0].player).toBeNull();
  });

  it("never crosses the uniform, overrules a read number, or names someone twice", () => {
    expect(run([subj({ team: "B" })], { P1: [hint(ogbechie, 0.6)] })[0].player).toBeNull();
    expect(run([subj({ number: "2?", clarity: "partial" })], { P1: [hint(ogbechie, 0.6)] })[0].player).toBeNull();
    expect(run([subj({ number: "1?", clarity: "partial" })], { P1: [hint(ogbechie, 0.6), hint(reilly, 0.3)] })[0].player?.lastName).toBe("Ogbechie");
    const ids = run([subj({ number: "14", clarity: "clear" }), subj({ id: "P2" })], { P2: [hint(ogbechie, 0.6)] });
    expect(ids[0].player?.lastName).toBe("Ogbechie");
    expect(ids[1].player).toBeNull();
  });

  it("lets a strong face say an unread digit was never there — '2?' on #2 — but not stretch a loose one", () => {
    expect(run([subj({ number: "2?", clarity: "partial" })], { P1: [hint(reilly, 0.6)] })[0].player?.lastName).toBe("Reilly");
    expect(run([subj({ number: "2?", clarity: "partial" })], { P1: [hint(reilly, 0.44)] })[0].player).toBeNull();
  });

  it("settles a partly read number when a clear face agrees with it", () => {
    const [id] = run([subj({ number: "14", clarity: "partial" })], { P1: [hint(ogbechie, 0.45)] });
    expect(id).toMatchObject({ status: "confirmed" });
    expect(id.reason).toMatch(/face agrees/);
    const [weak] = run([subj({ number: "14", clarity: "partial" })], { P1: [hint(ogbechie, 0.35)] });
    expect(weak.status).toBe("likely");
  });

  it("does nothing to an identity read from the number", () => {
    const [id] = run([subj({ number: "15", clarity: "clear" })], { P1: [hint(ogbechie, 0.7)] });
    expect(id.player?.lastName).toBe("Jackson");
  });

  it("ignores hints saved by the first matcher", () => {
    expect(currentHints({ P1: [{ playerID: "x", distance: 0.4 }], P2: [{ playerID: "y", score: 0.5, good: true }] })).toEqual({ P1: [], P2: [{ playerID: "y", score: 0.5, good: true }] });
  });
});

describe("a face among the players the digits allow", () => {
  it("names the one a looser match picks out, for review", () => {
    const [id] = run([subj({ number: "1?", clarity: "partial" })], { P1: [hint(ogbechie, 0.42, false)] });
    expect(id).toMatchObject({ status: "likely", source: "face" });
    expect(id.player?.lastName).toBe("Ogbechie");
    expect(id.reason).toMatch(/Read 1_/);
  });
});

describe("face geometry", () => {
  const face = (x: number, y: number, w: number, score = 0.9): DetectedFace => ({
    x, y, w, h: w * 1.2, score,
    points: [[x + w * 0.3, y + w * 0.45], [x + w * 0.7, y + w * 0.45], [x + w * 0.5, y + w * 0.65], [x + w * 0.35, y + w * 0.85], [x + w * 0.65, y + w * 0.85]],
  });

  it("lays the template onto itself unchanged, and a scaled, moved face onto the template", () => {
    const [a, b, c, d, e, f] = alignmentTransform(TEMPLATE);
    expect([a, b, c, d, e, f].map((v) => Math.abs(+v.toFixed(6)))).toEqual([1, 0, 0, 1, 0, 0]);
    const moved = TEMPLATE.map(([x, y]) => [x * 3 + 500, y * 3 + 200] as [number, number]);
    const t = alignmentTransform(moved);
    const [x, y] = moved[2];
    expect(t[0] * x + t[2] * y + t[4]).toBeCloseTo(TEMPLATE[2][0], 4);
    expect(t[1] * x + t[3] * y + t[5]).toBeCloseTo(TEMPLATE[2][1], 4);
  });

  it("undoes a rotation", () => {
    const r = Math.PI / 8, rot = TEMPLATE.map(([x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)] as [number, number]);
    const t = alignmentTransform(rot);
    rot.forEach(([x, y], i) => {
      expect(t[0] * x + t[2] * y + t[4]).toBeCloseTo(TEMPLATE[i][0], 3);
      expect(t[1] * x + t[3] * y + t[5]).toBeCloseTo(TEMPLATE[i][1], 3);
    });
  });

  it("decodes YuNet's outputs to a face in input pixels", () => {
    // One confident cell at stride 32, row 1, column 2, with a 64-pixel box centred on it.
    const out: Record<string, { data: Float32Array }> = {};
    for (const s of [8, 16, 32]) {
      const n = (64 / s) * (128 / s);
      out[`cls_${s}`] = { data: new Float32Array(n) }; out[`obj_${s}`] = { data: new Float32Array(n) };
      out[`bbox_${s}`] = { data: new Float32Array(n * 4) }; out[`kps_${s}`] = { data: new Float32Array(n * 10) };
    }
    const i = 1 * 4 + 2; // 128 / 32 = 4 columns
    out.cls_32.data[i] = 0.9; out.obj_32.data[i] = 1;
    out.bbox_32.data.set([0.5, 0.5, Math.log(2), Math.log(2)], i * 4);
    const [f] = decodeYuNet(out, 128, 64);
    expect(f.score).toBeCloseTo(Math.sqrt(0.9), 5);
    expect([f.x, f.y, f.w, f.h].map((v) => Math.round(v))).toEqual([48, 16, 64, 64]);
    expect(f.points[0]).toEqual([64, 32]);
  });

  it("takes the face in the subject's box, not a neighbour's at its edge", () => {
    const box: [number, number, number, number] = [100, 100, 300, 600];
    const mine = face(180, 150, 50, 0.8), neighbour = face(290, 160, 60, 0.95), below = face(180, 520, 60, 0.99);
    expect(pickSubjectFace([neighbour, mine, below], box)).toBe(mine);
    const r = headRegion(box, 1000, 1000);
    expect(r.y).toBeLessThan(100);
    expect(r.y + r.h).toBeLessThan(600);
  });

  it("measures the eyes and the turn of the head", () => {
    const q = quality(face(0, 0, 100));
    expect(q.eyes).toBeCloseTo(40, 5);
    expect(q.yaw).toBeCloseTo(0, 5);
  });

  it("compares unit vectors by cosine", () => {
    const v = flipAverage([1, 0, 0], [0.8, 0.6, 0]);
    expect(cosine(v, v)).toBeCloseTo(1, 6);
    expect(cosine(v, flipAverage([0, 0, 1], [0, 0, 1]))).toBeCloseTo(0, 6);
  });
});
