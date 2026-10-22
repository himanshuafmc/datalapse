// Scene plug-in registry. To add a scene type, create one file in this
// folder that exports a class extending Scene (see AGENTS.md), then add it
// to the list below. Nothing else in the app needs to change.

import { HookScene } from './HookScene.js';
import { TitleScene } from './TitleScene.js';
import { BarRaceScene } from './BarRaceScene.js';
import { LineRaceScene } from './LineRaceScene.js';
import { DotGridScene } from './DotGridScene.js';
import { GrowBarsScene } from './GrowBarsScene.js';
import { StatCardsScene } from './StatCardsScene.js';
import { OutroScene } from './OutroScene.js';
import { MapRaceScene } from './MapRaceScene.js';
import { BubbleScene } from './BubbleScene.js';
import { StackedAreaScene } from './StackedAreaScene.js';
import { BumpScene } from './BumpScene.js';
import { VersusScene } from './VersusScene.js';
import { WaffleScene } from './WaffleScene.js';
import { QuizScene } from './QuizScene.js';

export const SCENE_TYPES = [
  HookScene, TitleScene, BarRaceScene, LineRaceScene, MapRaceScene, BubbleScene, StackedAreaScene, BumpScene, VersusScene,
  DotGridScene, WaffleScene, GrowBarsScene, StatCardsScene, QuizScene, OutroScene,
];

/** Scenes whose length comes from a pace over data time (they need data). */
export function isPaced(type) {
  const S = byType.get(type);
  return !!S && (S.paced || ['barRace', 'lineRace', 'dotGrid'].includes(type));
}

const byType = new Map(SCENE_TYPES.map((S) => [S.type, S]));

export function sceneClass(type) {
  const S = byType.get(type);
  if (!S) throw new Error(`Unknown scene type "${type}". Known types: ${[...byType.keys()].join(', ')}`);
  return S;
}

export function registerScene(S) {
  if (!S.type) throw new Error('A scene class needs a static "type"');
  if (!byType.has(S.type)) SCENE_TYPES.push(S);
  byType.set(S.type, S);
}
