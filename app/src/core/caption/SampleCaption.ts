/**
 * A worked example of the chosen house style, for the settings screen.
 *
 * This runs the real composer over a fixed, invented frame, so the example is not a hand-written
 * approximation that can drift — it is what the app would actually write. No request is made and
 * nothing is sent anywhere.
 */

import { Roster, RosterPlayer, Team } from "../roster/Roster";
import { VisionResult, VisionPlayer } from "../vision/VisionResult";
import { CaptionComposer } from "./CaptionComposer";
import { CompositionContext, type CaptionStyle } from "./CompositionContext";
import { localDate } from "../images/PhotoMetadata";

const nebraska = Team.make("Nebraska", "red", "Cornhuskers", "sample-neb");
const ohioState = Team.make("Ohio State", "grey", "Buckeyes", "sample-osu");

const roster = Roster.make(nebraska, ohioState, [
  RosterPlayer.make({ teamID: nebraska.id, jerseyNumber: "2", firstName: "Adrian", lastName: "Martinez", position: "quarterback" }),
]);

const frame = VisionResult.make({
  sceneType: "players_action",
  players: [VisionPlayer.make("2", "red", "throws a pass in the third quarter")],
  subjectTeamColor: "red",
});

export const SampleCaption = {
  text(style: CaptionStyle, photographer: string, house = ""): string {
    const trimmed = photographer.trim();
    const context = CompositionContext.make({
      style,
      sport: "football",
      roster,
      iptc: { dateText: "Sept. 14, 2024", venue: "Memorial Stadium", city: "Lincoln", state: "Neb.", leagueLevel: "college" },
      photographer: trimmed || null,
      house: house.trim() || null,
      weekday: "Saturday",
      captureDate: localDate(2024, 9, 14), // a Saturday
    });
    return CaptionComposer.compose(frame, context).caption;
  },
};
