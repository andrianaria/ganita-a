import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { RestaurantWorld } from "./bot-crossing/world/restaurant.js";

describe("restaurant universe", () => {
  let world: RestaurantWorld;
  const labels: string[] = [];
  const outlets = [{ id: "a", outletName: "Demo Outlet A", score: 86 }, { id: "b", outletName: "Demo Outlet B", score: null }];
  beforeEach(() => {
    labels.length = 0;
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({
      beginPath() {}, roundRect() {}, fill() {}, measureText: (text: string) => ({ width: text.length * 20 }), fillText: (text: string) => labels.push(text),
    }) }) });
  });
  afterEach(() => { world?.dispose(); vi.unstubAllGlobals(); });
  it("creates one restaurant per real outlet and never invents a health score", () => {
    world = new RestaurantWorld(new THREE.Scene(), outlets, "id");
    expect([...world.restaurants.keys()]).toEqual(["a", "b"]);
    expect(labels).toEqual(["Demo Outlet A", "86/100 | Sehat", "Demo Outlet B", "Belum ada skor"]);
    expect(world.robots).toHaveLength(6);
    expect(world.restaurants.get("a")!.group.userData.outletId).toBe("a");
  });
  it("shows attention and critical states in the chosen language", () => {
    world = new RestaurantWorld(new THREE.Scene(), [{ ...outlets[0], score: 65 }, { ...outlets[1], score: 40 }], "en");
    expect(labels).toContain("65/100 | Needs attention");
    expect(labels).toContain("40/100 | Critical");
  });
  it("highlights only the selected restaurant without changing its score", () => {
    world = new RestaurantWorld(new THREE.Scene(), outlets, "id");
    world.select("b");
    expect(world.restaurants.get("b")!.base.material.color.getHexString()).toBe("38bea4");
    expect(world.restaurants.get("a")!.base.material.color.getHexString()).toBe("c5d6d1");
    world.select("a");
    expect(world.restaurants.get("b")!.base.material.color.getHexString()).toBe("c5d6d1");
    expect(outlets[1].score).toBeNull();
  });
  it("moves agents, pauses them, and changes work areas without mutating outlet data", () => {
    world = new RestaurantWorld(new THREE.Scene(), outlets, "id");
    world.update(1, false);
    const before = world.robots[0].mesh.position.clone();
    world.update(1, false);
    expect(world.robots[0].mesh.position.equals(before)).toBe(false);
    const paused = world.robots[0].mesh.position.clone();
    world.update(1, true);
    expect(world.robots[0].mesh.position.equals(paused)).toBe(true);
    world.mode = "kitchen"; world.update(0, true);
    expect(world.robots[0].mesh.position.z).toBe(-4.6);
    world.mode = "stock"; world.update(0, true);
    expect(world.robots[0].mesh.position.z).toBe(-4.3);
    expect(outlets[0].score).toBe(86);
  });
  it("picks the restaurant under the pointer using the outlet ID", () => {
    const scene = new THREE.Scene();
    world = new RestaurantWorld(scene, outlets, "id");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    const position = world.restaurants.get("b")!.position;
    camera.position.set(position.x, 30, position.z + 8);
    camera.lookAt(position); camera.updateMatrixWorld(); scene.updateMatrixWorld(true);
    expect(world.pick(0, 0, camera)).toBe("b");
  });
  it("handles an empty layout and releases GPU resources on unmount", () => {
    const scene = new THREE.Scene();
    world = new RestaurantWorld(scene, [], "id");
    expect(Number.isFinite(world.extent)).toBe(true);
    const textureDisposals = [...world.geometries.values()].map(geometry => vi.spyOn(geometry, "dispose"));
    world.dispose();
    expect(scene.children).toHaveLength(0);
    textureDisposals.forEach(dispose => expect(dispose).toHaveBeenCalledTimes(1));
  });
});
