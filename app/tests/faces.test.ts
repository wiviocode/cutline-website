import { describe, it, expect } from "vitest";
import { applyFaceHints } from "../src/core/vision/FaceEvidence";
import { Identify } from "../src/core/vision/Identify";
import { Team, Player } from "../src/core/roster/Roster";
import type { Observation, Subject } from "../src/core/vision/Observation";

const ogbechie = Player.make({ number: "14", firstName: "Manaia", lastName: "Ogbechie" });
const jackson = Player.make({ number: "15", firstName: "Andi", lastName: "Jackson" });
const reilly = Player.make({ number: "2", firstName: "Bergen", lastName: "Reilly" });
const taylor = Player.make({ number: "21", firstName: "Jackie", lastName: "Taylor" });
const matchup = { a: Team.make({ school: "Nebraska", players: [ogbechie, jackson, reilly] }), b: Team.make({ school: "North Carolina", players: [taylor] }) };
const subj = (x: Partial<Subject>): Subject => ({ id: "P1", kind: "athlete", team: "A", number: "", numberOn: "none", clarity: "hidden", player: "", role: "", uniformText: "", box: [0, 0, 10, 10], ...x });
const run = (subjects: Subject[], hints: Record<string, { playerID: string; distance: number }[]>) => {
  const obs: Observation = { scene: "celebration", timing: "during", clause: "{P1} celebrates", subjects };
  return applyFaceHints(Identify.all(obs, { matchup, unitSport: false }), obs, hints, matchup);
};

describe("what a face match may do", () => {
  it("names an athlete with no visible number when the match is strong and clear, as likely only", () => {
    const [id] = run([subj({})], { P1: [{ playerID: ogbechie.id, distance: 0.46 }, { playerID: jackson.id, distance: 0.58 }] });
    expect(id).toMatchObject({ status: "likely", source: "face", teamKey: "A" });
    expect(id.player?.lastName).toBe("Ogbechie");
  });

  it("leaves a weak or crowded match to the photographer", () => {
    expect(run([subj({})], { P1: [{ playerID: ogbechie.id, distance: 0.53 }] })[0].player).toBeNull();
    expect(run([subj({})], { P1: [{ playerID: ogbechie.id, distance: 0.46 }, { playerID: jackson.id, distance: 0.49 }] })[0].player).toBeNull();
  });

  it("never crosses the uniform, overrules a read number, or names someone twice", () => {
    expect(run([subj({ team: "B" })], { P1: [{ playerID: ogbechie.id, distance: 0.4 }] })[0].player).toBeNull();
    expect(run([subj({ number: "2?", clarity: "partial" })], { P1: [{ playerID: ogbechie.id, distance: 0.4 }] })[0].player).toBeNull();
    expect(run([subj({ number: "1?", clarity: "partial" })], { P1: [{ playerID: ogbechie.id, distance: 0.4 }, { playerID: reilly.id, distance: 0.6 }] })[0].player?.lastName).toBe("Ogbechie");
    const ids = run([subj({ number: "14", clarity: "clear" }), subj({ id: "P2" })], { P2: [{ playerID: ogbechie.id, distance: 0.4 }] });
    expect(ids[0].player?.lastName).toBe("Ogbechie");
    expect(ids[1].player).toBeNull();
  });

  it("settles a partly read number when a strong face agrees with it", () => {
    const [id] = run([subj({ number: "14", clarity: "partial" })], { P1: [{ playerID: ogbechie.id, distance: 0.46 }] });
    expect(id).toMatchObject({ status: "confirmed" });
    expect(id.reason).toMatch(/face agrees/);
    const [weak] = run([subj({ number: "14", clarity: "partial" })], { P1: [{ playerID: ogbechie.id, distance: 0.55 }] });
    expect(weak.status).toBe("likely");
  });

  it("does nothing to an identity already set by hand or read from the number", () => {
    const [id] = run([subj({ number: "15", clarity: "clear" })], { P1: [{ playerID: ogbechie.id, distance: 0.3 }] });
    expect(id.player?.lastName).toBe("Jackson");
  });
});

describe("a face among the players the digits allow", () => {
  it("names the one a looser match picks out, for review", () => {
    const [id] = run([subj({ number: "1?", clarity: "partial" })], { P1: [{ playerID: ogbechie.id, distance: 0.55 }] });
    expect(id).toMatchObject({ status: "likely", source: "face" });
    expect(id.player?.lastName).toBe("Ogbechie");
    expect(id.reason).toMatch(/Read 1_/);
  });
});
