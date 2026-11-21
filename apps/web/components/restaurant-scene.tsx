"use client";

import { useEffect, useRef, useState } from "react";
import { Boxes, ChefHat, Maximize, Minus, Pause, Play, Plus, RotateCcw, Utensils } from "lucide-react";

export type SceneOutlet = { id: string; outletName: string; score: number | null; status: "ready" | "attention" };
type Props = { agents: SceneOutlet[]; selectedId: string; onSelect: (id: string) => void; language: "id" | "en" };

export function RestaurantScene({ agents, selectedId, onSelect, language }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState("service");
  const options = useRef({ paused, mode, selectedId });
  options.current = { paused, mode, selectedId };
  const t = (id: string, en: string) => language === "id" ? id : en;

  useEffect(() => {
    let alive = true;
    let engine: any, rig: any, world: any, observer: ResizeObserver | undefined;
    let click: ((event: PointerEvent) => void) | undefined;
    let keyboard: ((event: KeyboardEvent) => void) | undefined;
    const teardown = () => {
      observer?.disconnect();
      if (click) engine?.canvas.removeEventListener("pointerup", click);
      if (keyboard) engine?.canvas.removeEventListener("keydown", keyboard);
      engine?.stop(); rig?.dispose(); world?.dispose(); engine?.dispose(); engine?.canvas.remove();
      runtime.current = null;
    };
    async function boot() {
      try {
        setState("loading");
        const { Engine } = await import("../lib/bot-crossing/core/engine.js");
        const { CameraRig } = await import("../lib/bot-crossing/core/camera.js");
        const { Settings } = await import("../lib/bot-crossing/core/settings.js");
        const { RestaurantWorld } = await import("../lib/bot-crossing/world/restaurant.js");
        if (!alive || !host.current) return;
        const settings = new Settings();
        Object.assign(settings.values, { bloom: false, tiltShift: false, antialias: true, exposure: 1, fov: 45, autoFrame: false, autoQuality: true, renderScale: Math.min(1, 1.5 / (window.devicePixelRatio || 1)) });
        engine = new Engine(settings).mount(host.current);
        Object.assign(engine.canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", cursor: "grab" });
        engine.canvas.setAttribute("aria-label", language === "id" ? "Dunia restoran interaktif" : "Interactive restaurant world");
        engine.canvas.tabIndex = 0;
        rig = new CameraRig(engine.camera, engine.canvas, settings);
        world = new RestaurantWorld(engine.scene, agents, language);
        world.select(options.current.selectedId);
        const reset = () => {
          rig.resetView();
          rig.desiredAzimuth = Math.PI / 5;
          // Fit the complete district to the viewport, including elevated outlet signs.
          const azimuth = rig.desiredAzimuth, polar = rig.desiredPolar;
          const tan = Math.tan(engine.camera.fov * Math.PI / 360);
          let distance = 40;
          for (const x of [-world.width / 2, world.width / 2]) for (const z of [-world.depth / 2, world.depth / 2]) for (const y of [0, 8]) {
            const depth = x * Math.sin(polar) * Math.sin(azimuth) + y * Math.cos(polar) + z * Math.sin(polar) * Math.cos(azimuth);
            const horizontal = x * Math.cos(azimuth) - z * Math.sin(azimuth);
            const vertical = -x * Math.cos(polar) * Math.sin(azimuth) + y * Math.sin(polar) - z * Math.cos(polar) * Math.cos(azimuth);
            distance = Math.max(distance, depth + Math.abs(horizontal) / (tan * engine.camera.aspect), depth + Math.abs(vertical) / tan);
          }
          rig.desiredDistance = Math.min(150, distance * 1.13);
        };
        reset();
        rig.distance = rig.desiredDistance;
        rig.azimuth = rig.desiredAzimuth;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPaused(true);
        let compact = host.current.clientWidth < 640;
        observer = new ResizeObserver(() => {
          engine.resize();
          const next = (host.current?.clientWidth ?? 0) < 640;
          if (next !== compact) { compact = next; reset(); }
        });
        observer.observe(host.current);
        runtime.current = { rig, world, reset };
        click = event => {
          if (event.button !== 0 || !event.isPrimary || !rig.wasClick || rig._pointers.size > 1) return;
          const rect = engine.canvas.getBoundingClientRect();
          const id = world.pick((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1, engine.camera);
          if (id) onSelect(id);
        };
        keyboard = event => {
          if (["+", "=", "-", "0"].includes(event.key)) event.preventDefault();
          if (event.key === "+" || event.key === "=") rig.zoomBy(-0.2);
          if (event.key === "-") rig.zoomBy(0.2);
          if (event.key === "0") reset();
        };
        engine.canvas.addEventListener("pointerup", click);
        engine.canvas.addEventListener("keydown", keyboard);
        engine.add({ update: (dt: number) => {
          rig.update(dt);
          world.mode = options.current.mode;
          world.update(dt, options.current.paused);
          engine.canvas.dataset.zoom = rig.distance.toFixed(2);
          engine.canvas.dataset.motion = world.time.toFixed(2);
        } });
        engine.start();
        setState("ready");
      } catch {
        teardown();
        if (alive) setState("error");
      }
    }
    void boot();
    return () => { alive = false; teardown(); };
  }, [agents, onSelect, language, attempt]);

  useEffect(() => {
    const current = runtime.current;
    if (!current) return;
    current.world.select(selectedId);
    const restaurant = current.world.restaurants.get(selectedId);
    if (restaurant) current.rig.focus(restaurant.position, { distance: (host.current?.clientWidth ?? 1000) < 640 ? 76 : 44 });
  }, [selectedId]);

  const control = "flex h-10 w-10 items-center justify-center rounded text-[#244c44] hover:bg-[#e7f3ee] disabled:opacity-40";
  return <div ref={host} data-testid="restaurant-scene" data-state={state} className="relative min-h-0 flex-1 touch-none overflow-hidden bg-[#c9dfdf]">
    {state !== "ready" && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#e1eeeb] p-6 text-center text-sm" role={state === "error" ? "alert" : "status"}>
      <ChefHat size={28} />
      <p>{state === "error" ? t("Tampilan 3D belum dapat dibuka. Data outlet tetap tersedia.", "3D could not load. Outlet data is still available.") : t("Menyiapkan restoran...", "Preparing restaurants...")}</p>
      {state === "error" && <button onClick={() => setAttempt(value => value + 1)} className="rounded border border-[#92bcb0] px-4 py-2">{t("Coba lagi", "Try again")}</button>}
    </div>}
    <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded bg-white/95 px-3 py-2 text-xs font-semibold text-[#315b50] shadow-sm"><ChefHat size={16} />{agents.length} {t("restoran", "restaurants")}</div>
    <div className="absolute right-3 top-3 z-10 flex flex-col rounded-md border border-white/80 bg-white/95 p-1 shadow-sm">
      <button disabled={state !== "ready"} className={control} title={t("Perbesar peta", "Zoom in")} aria-label={t("Perbesar peta", "Zoom in")} onClick={() => runtime.current?.rig.zoomBy(-0.2)}><Plus size={18} /></button>
      <button disabled={state !== "ready"} className={control} title={t("Perkecil peta", "Zoom out")} aria-label={t("Perkecil peta", "Zoom out")} onClick={() => runtime.current?.rig.zoomBy(0.2)}><Minus size={18} /></button>
      <button disabled={state !== "ready"} className={control} title={t("Lihat semua restoran", "View all restaurants")} aria-label={t("Lihat semua restoran", "View all restaurants")} onClick={() => runtime.current?.reset()}><Maximize size={17} /></button>
      <button disabled={state !== "ready"} className={control} title={t("Putar tampilan", "Rotate view")} aria-label={t("Putar tampilan", "Rotate view")} onClick={() => { if (runtime.current) runtime.current.rig.desiredAzimuth += Math.PI / 2; }}><RotateCcw size={17} /></button>
      <button disabled={state !== "ready"} className={control} title={paused ? t("Lanjutkan animasi", "Resume animation") : t("Jeda animasi", "Pause animation")} aria-label={paused ? t("Lanjutkan animasi", "Resume animation") : t("Jeda animasi", "Pause animation")} onClick={() => setPaused(value => !value)}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
    </div>
    <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 rounded-md border border-white/80 bg-white/95 p-2 text-xs shadow-sm sm:right-auto">
      <span className="px-2 text-[#627b74]">{t("Simulasi aktivitas", "Activity simulation")}</span>
      <div className="flex gap-1" role="group" aria-label={t("Aktivitas restoran", "Restaurant activity")}>
        {([{ key: "service", icon: Utensils, label: t("Layanan", "Service") }, { key: "kitchen", icon: ChefHat, label: t("Dapur", "Kitchen") }, { key: "stock", icon: Boxes, label: t("Stok", "Stock") }]).map(item => <button key={item.key} aria-pressed={mode === item.key} onClick={() => setMode(item.key)} className={`flex items-center gap-1.5 rounded px-2.5 py-2 font-medium ${mode === item.key ? "bg-[#173d34] text-white" : "text-[#42695e] hover:bg-[#e7f3ee]"}`}><item.icon size={15} />{item.label}</button>)}
      </div>
    </div>
  </div>;
}
