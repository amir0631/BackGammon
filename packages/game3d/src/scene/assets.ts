// Materials and geometries per theme and quality, built once and disposed when they change.
import * as THREE from "three";
import { boardDefaultTheme } from "@bg/design-tokens";
import { brassGeometry, checkerGeometry, dieGeometry, railsGeometry } from "./models";
import { boardTheme, checkerTheme } from "./theme";
import {
  arrowTexture,
  blobTexture,
  boardTopTexture,
  checkerTexture,
  contactShadowTexture,
  diceTexture,
  markerTexture,
  railTexture,
  ringTexture,
  type Quality,
} from "./textures";

export interface SceneAssets {
  boardTop: THREE.MeshStandardMaterial;
  rails: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  slab: THREE.MeshStandardMaterial;
  contact: THREE.MeshBasicMaterial;
  blob: THREE.MeshBasicMaterial;
  checkers: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  die: THREE.MeshStandardMaterial;
  sourceRing: THREE.MeshBasicMaterial;
  selectRing: THREE.MeshBasicMaterial;
  trail: THREE.MeshBasicMaterial;
  markers: Map<string, THREE.MeshBasicMaterial>;
  geo: {
    rails: THREE.BufferGeometry;
    brass: THREE.BufferGeometry;
    checker: THREE.BufferGeometry;
    die: THREE.BufferGeometry;
    plane: THREE.PlaneGeometry;
  };
  dispose: () => void;
}

export function buildAssets(
  themes: { board: string; checkers: [string, string] },
  quality: Quality,
  labels: { digits: readonly string[]; off: string; font: string },
): SceneAssets {
  const theme = boardTheme(themes.board);
  const shade = boardDefaultTheme.shadow;
  const top = boardTopTexture(theme, quality);
  const rail = railTexture(theme, quality);
  const sides = ([0, 1] as const).map((side) => {
    const c = checkerTheme(themes.checkers[side], side);
    return checkerTexture(c.body, c.rim, side === 0 ? "star" : "rings", quality, shade, theme.inlayBone);
  });
  const dice = diceTexture(theme.diceBody, theme.dicePip, quality, shade);
  const blob = blobTexture(shade);
  const contact = contactShadowTexture(shade);
  const source = ringTexture(theme.legalMove, 0.14);
  const select = ringTexture(theme.selection, 0.22);
  const arrow = arrowTexture(theme.trail);
  const textures: THREE.Texture[] = [top, rail, ...sides, dice, blob, contact, source, select, arrow];

  const markers = new Map<string, THREE.MeshBasicMaterial>();
  [...labels.digits, labels.off].forEach((label) => {
    const tex = markerTexture(theme, label, labels.font);
    textures.push(tex);
    markers.set(label, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  });

  const standard = (params: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(params);
  const assets: SceneAssets = {
    boardTop: standard({ map: top, roughness: 0.6, metalness: 0 }),
    rails: standard({ map: rail, roughness: 0.55, metalness: 0 }),
    brass: standard({ color: theme.brass, roughness: 0.35, metalness: 0.65 }),
    slab: standard({ color: theme.frameWoodDark, roughness: 0.7, metalness: 0 }),
    contact: new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false }),
    blob: new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0.8 }),
    checkers: [
      standard({ map: sides[0]!, roughness: 0.4, metalness: 0 }),
      standard({ map: sides[1]!, roughness: 0.35, metalness: 0 }),
    ],
    die: standard({ map: dice, roughness: 0.35, metalness: 0, transparent: true }),
    sourceRing: new THREE.MeshBasicMaterial({ map: source, transparent: true, depthWrite: false }),
    selectRing: new THREE.MeshBasicMaterial({ map: select, transparent: true, depthWrite: false }),
    trail: new THREE.MeshBasicMaterial({ map: arrow, transparent: true, depthWrite: false, opacity: 0.75 }),
    markers,
    geo: {
      rails: railsGeometry(),
      brass: brassGeometry(),
      checker: checkerGeometry(quality === "lite" ? 28 : 40),
      die: dieGeometry(quality === "lite" ? 2 : 3),
      plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    },
    dispose: () => {
      textures.forEach((t) => t.dispose());
      Object.values(assets.geo).forEach((g) => g.dispose());
      [assets.boardTop, assets.rails, assets.brass, assets.slab, assets.contact, assets.blob, ...assets.checkers, assets.die, assets.sourceRing, assets.selectRing, assets.trail, ...markers.values()].forEach((m) => m.dispose());
    },
  };
  return assets;
}
