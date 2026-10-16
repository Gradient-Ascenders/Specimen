import type { Group } from 'three';
import { BOB_AUTHORED_ASSET_URL, GOOP_AUTHORED_ASSET_URL, GOOP_DETAIL_ASSET_URL } from '../render/slime/CharacterAssetUrls.ts';
import { readCharacterDetail, type CharacterDetailIndices } from '../render/slime/CharacterDetail.ts';
import { parseCharacterAsset } from '../render/slime/LoadCharacterAsset.ts';

export interface ContainmentCharacterLoaders {
  readonly bob: () => Promise<Group>;
  readonly goop: () => Promise<Group>;
  readonly goopDetail: () => Promise<readonly CharacterDetailIndices[]>;
}

interface PreloadBank {
  readonly controller: AbortController;
  readonly bytes: Map<string, Promise<ArrayBuffer>>;
  readonly ready: Promise<void>;
  lightReady?: Promise<void>;
  lightStopped: boolean;
  detail?: readonly CharacterDetailIndices[];
  cancelIdle?: () => void;
}

const ASSET_URLS = [BOB_AUTHORED_ASSET_URL, GOOP_AUTHORED_ASSET_URL, GOOP_DETAIL_ASSET_URL] as const;
const MAX_LIGHT_DETAIL_BYTES = 64 * 1024;
const MIN_IDLE_MILLISECONDS = 4;
type IdleWindow = Pick<Window, 'requestIdleCallback' | 'cancelIdleCallback'>;

/** Bounded, per-opening download bank. preload() retains raw bytes only;
 * demand loaders parse independent models when real preparation begins. */
export class ContainmentAssetPreload {
  private bank: PreloadBank | undefined;
  private readonly fetchAsset: typeof fetch;
  private readonly idleWindow: IdleWindow | undefined;
  readonly loaders: ContainmentCharacterLoaders = {
    bob: async () => parseCharacterAsset(await this.read(BOB_AUTHORED_ASSET_URL), BOB_AUTHORED_ASSET_URL),
    goop: async () => parseCharacterAsset(await this.read(GOOP_AUTHORED_ASSET_URL), GOOP_AUTHORED_ASSET_URL),
    goopDetail: () => this.readDetail(),
  };

  constructor(fetchAsset: typeof fetch = globalThis.fetch.bind(globalThis),
    idleWindow: IdleWindow | undefined = typeof window === 'undefined' ? undefined : window) {
    this.fetchAsset = fetchAsset;
    this.idleWindow = idleWindow;
  }

  preload(priority: RequestPriority = 'low'): Promise<void> {
    if (this.bank) {
      // Skip/final blackout promotes preparation without duplicating transfers
      // or waiting for an idle callback that a busy browser might never grant.
      if (priority === 'high') this.stopLightPreparation(this.bank);
      return this.bank.ready;
    }
    const controller = new AbortController();
    const bytes = new Map(ASSET_URLS.map(url => [url,
      this.download(url, { priority, signal: controller.signal })]));
    // Speculation is best-effort. Required failures are retried/reported by the
    // real level preparation; optional LOD failures keep their usual fallback.
    const ready = Promise.allSettled(bytes.values()).then(() => {});
    this.bank = { controller, bytes, ready, lightStopped: priority === 'high' };
    return ready;
  }

  /** Allowlisted light work only: low-priority bytes and a tiny index-data bank.
   * Never parse GLBs, build geometry/textures, compile shaders or submit GPU work.
   * Busy/unsupported browsers simply retain bytes; no timer forces CPU work. */
  prepareLight(): Promise<void> {
    void this.preload('low');
    const bank = this.bank!;
    if (bank.lightReady) return bank.lightReady;
    if (bank.lightStopped) return bank.ready;
    const detailReady = bank.bytes.get(GOOP_DETAIL_ASSET_URL)!.then(bytes => {
      if (bytes.byteLength > MAX_LIGHT_DETAIL_BYTES || bank.lightStopped || bank.controller.signal.aborted) return;
      return this.prepareDetailWhenIdle(bank, bytes);
    }).catch(() => {}); // Optional detail retains its normal demand-time fallback.
    bank.lightReady = Promise.all([bank.ready, detailReady]).then(() => {});
    return bank.lightReady;
  }

  clear(): void {
    const bank = this.bank;
    this.bank = undefined;
    if (bank) this.stopLightPreparation(bank);
    bank?.controller.abort();
  }

  private stopLightPreparation(bank: PreloadBank): void {
    bank.lightStopped = true;
    bank.cancelIdle?.();
  }

  private prepareDetailWhenIdle(bank: PreloadBank, bytes: ArrayBuffer): Promise<void> | undefined {
    const host = this.idleWindow;
    if (typeof host?.requestIdleCallback !== 'function' || typeof host.cancelIdleCallback !== 'function') return;
    return new Promise(resolve => {
      let handle = 0;
      const finish = () => { bank.cancelIdle = undefined; resolve(); };
      const run = (deadline: IdleDeadline) => {
        if (bank.lightStopped || bank.controller.signal.aborted || bank !== this.bank) { finish(); return; }
        if (deadline.timeRemaining() < MIN_IDLE_MILLISECONDS) {
          handle = host.requestIdleCallback(run);
          return;
        }
        // Cache plain data only. Each character gets its own mutable index copy
        // later, when actual model preparation owns the geometry.
        try { bank.detail = readCharacterDetail(bytes); } catch { /* Optional. */ }
        finish();
      };
      bank.cancelIdle = () => { host.cancelIdleCallback(handle); finish(); };
      handle = host.requestIdleCallback(run);
    });
  }

  private async readDetail(): Promise<readonly CharacterDetailIndices[]> {
    const bank = this.bank;
    if (bank) this.stopLightPreparation(bank);
    return bank?.detail?.map(record => ({ ...record, indices: record.indices.slice() }))
      ?? readCharacterDetail(await this.read(GOOP_DETAIL_ASSET_URL));
  }

  private async read(url: string): Promise<ArrayBuffer> {
    const bank = this.bank, pending = bank?.bytes.get(url);
    if (bank && pending) {
      try { return await pending; }
      catch (error) {
        if (bank.controller.signal.aborted) throw error;
        const retry = bank.bytes.get(url);
        if (retry && retry !== pending) return retry;
        const required = this.download(url, { signal: bank.controller.signal });
        bank.bytes.set(url, required);
        return required;
      }
    }
    return this.download(url);
  }

  private async download(url: string, options?: RequestInit): Promise<ArrayBuffer> {
    const response = await this.fetchAsset(url, options);
    if (!response.ok) throw new Error(`Containment asset ${url}: HTTP ${response.status} ${response.statusText}`);
    return response.arrayBuffer();
  }
}
