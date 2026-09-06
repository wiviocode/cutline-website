/**
 * What the model should know about each sport before it reads a frame: the verbs a desk uses,
 * where the number is, what stands in for a jersey number where there is none, and what to
 * flag. A few lines per sport, sent with each photograph's context rather than in the cached
 * system prompt, so the prompt stays one thing for every sport and the notes cost a few hundred
 * tokens a frame.
 *
 * Distilled from the sport files the original app shipped, rewritten for the structured reply:
 * everything here is about what to put in jersey_number, jersey_color, action, unit and flags.
 */

const GUIDES: Record<string, string> = {
  football: `Numbers: prefer the back; a helmet decal or shoulder number is a fallback and often abbreviated.
Verbs: throws a pass, carries the ball, catches a pass, runs with the ball, tackles, sacks the quarterback, intercepts a pass, breaks up a pass, blocks.
A ball carrier is on offense; a tackler is on defense — give the unit.`,
  basketball: `Verbs: shoots a jumper, drives to the basket, dunks, dribbles, passes, grabs a rebound, blocks a shot, defends, shoots a free throw.
Numbers are on the chest and the back; there are no helmets. When both teams are in the play, include the player from each side.`,
  volleyball: `Verbs: serves, sets, spikes, blocks, digs, passes, tips the ball.
Numbers are on the chest and the back. The libero wears a jersey of a contrasting colour to their own team: give the colour you see and add the flag "libero".`,
  soccer: `Verbs: kicks, dribbles, passes, shoots, heads the ball, tackles, challenges for the ball, makes a save.
Goalkeepers wear a colour different from their own team: give the colour you see and add the flag "goalkeeper". Numbers are on the back and often the shorts.`,
  baseball: `Verbs: pitches, bats, swings, hits, bunts, fields a grounder, throws to first, slides into second, tags the runner, catches a fly ball.
Numbers are on the back; batting helmets and the catcher's gear hide the chest, so read the back where you can.`,
  softball: `Verbs: pitches, bats, swings, hits, bunts, fields a grounder, throws to first, slides into second, tags the runner, catches a fly ball. Pitching is underhand.
Numbers are on the back; batting helmets and the catcher's gear hide the chest, so read the back where you can.`,
  hockey: `Verbs: shoots the puck, passes the puck, handles the puck, checks, blocks a shot, wins a faceoff, makes a save. Say "skates" only when nothing is happening with the stick or the puck.
Numbers are on the shoulders and the back, rarely the front; helmet numbers are tiny and a fallback only. Goaltenders have no helmet number and a different mask — add the flag "goaltender".`,
  lacrosse: `Verbs: shoots, passes, catches, scoops a ground ball, checks, clears, cradles the ball, makes a save.
Helmets and gloves; numbers are on the back and the shoulders. The goalie carries a wider stick.`,
  fieldHockey: `Verbs: dribbles, passes, shoots, tackles, hits, pushes, makes a save.
Sticks; no helmet except the goalkeeper's — add the flag "goalkeeper" for them. Numbers are on the back and the skirt or shorts.`,
  waterPolo: `The cap carries the number and the team colour: jersey_number is the cap number, jersey_color the cap colour. Goalkeepers wear a red cap — add the flag "goalkeeper".
Verbs: shoots, passes, blocks a shot, guards, swims with the ball, makes a save.`,
  wrestling: `There are no jersey numbers: leave jersey_number empty. jersey_color is the singlet colour, which is how the two teams are told apart.
Verbs: takes down, pins, escapes, reverses, rides, grapples with, shoots for a takedown, sprawls.`,
  tennis: `There are no numbers: leave jersey_number empty; jersey_color is the shirt colour. In singles the two players are opponents.
Verbs: serves, returns, hits a forehand, hits a backhand, volleys, reaches for a shot, celebrates a point.`,
  golf: `No numbers and no teams: leave jersey_number empty.
Verbs: tees off, drives, chips, putts, lines up a putt, reads the green, hits from the bunker, watches the shot. Name the hole only if a sign or flag shows it.`,
  trackAndField: `The bib number stands in for the jersey number: jersey_number is the bib as printed, never guessed; no bib, empty. jersey_color is the singlet.
Verbs: runs, sprints, clears a hurdle, hands off the baton, leaps in the long jump, clears the bar, throws the discus, throws the shot, throws the javelin, vaults. Name the event when the frame shows it.`,
  crossCountry: `The bib number stands in for the jersey number: jersey_number is the bib as printed; a bib with no number gives an empty jersey_number. jersey_color is the singlet.
Verbs: runs, leads the pack, kicks to the finish, climbs a hill, crosses the finish line.`,
  swimming: `There are no numbers: leave jersey_number empty; jersey_color is the cap colour, or the suit when there is no cap.
Verbs: swims the butterfly, swims freestyle, swims the backstroke, swims the breaststroke, dives from the block, turns at the wall, celebrates at the wall. Divers: performs a dive, enters the water.`,
  gymnastics: `There are no numbers: leave jersey_number empty; jersey_color is the leotard.
Verbs: performs on the balance beam, performs on the uneven bars, performs on the floor, vaults, performs on the rings, performs on the pommel horse, performs on the high bar, dismounts, holds a handstand, salutes the judges.`,
  autoRacing: `The car number is jersey_number and the car's main colour is jersey_color. Never name a driver from memory of a livery — read only what is printed.
Verbs: leads, passes, races through the turn, pits, spins, takes the checkered flag, crashes.`,
  horseRacing: `The saddlecloth number is jersey_number and its colour is jersey_color. When the digit is unclear the North American cloth colours are: 1 red, 2 white, 3 blue, 4 yellow, 5 green, 6 black, 7 orange, 8 pink, 9 turquoise, 10 purple, 11 grey, 12 lime, 13 brown, 14 maroon, 15 khaki, 16 light blue, 17 navy, 18 forest green, 19 royal blue, 20 fuchsia.
Verbs: breaks from the gate, leads, pulls away, wins by a length, finishes second, races down the stretch. Horses running left to right: the horse on the right leads.`,
  cricket: `Most kits carry no number: leave jersey_number empty unless a number is printed on the back. jersey_color is the shirt.
Verbs: bats, drives, pulls, sweeps, bowls, fields, catches, appeals, takes the stumps. Use "batter", "bowler" and "wicketkeeper".`,
};

export const SportGuide = {
  for(sport: string | null | undefined): string | null {
    if (!sport) return null;
    return GUIDES[sport] ?? null;
  },
  sports(): string[] { return Object.keys(GUIDES); },
};
