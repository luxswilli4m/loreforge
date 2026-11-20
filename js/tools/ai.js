// Bring-your-own-key AI providers. Keys are kept in this browser's localStorage only.
import { connected, serverAI } from '../cloud.js';
const KEY = 'loreforge:ai';
export const PROVIDERS = {
  cloud: { label: 'My Loreforge server (Cloudflare)', needsKey: false, server: true, models: ['(set on the server)'], help: 'Uses the AI configured on your own Cloudflare server — your OpenRouter key or Cloudflare’s free AI stays on the server, never on your devices. Sign in under ☁️ Cloud & devices.' },
  openrouter: { label: 'OpenRouter (free models available)', needsKey: true, base: 'https://openrouter.ai/api/v1', models: ['openrouter/free'], help: 'Make a free account at openrouter.ai → Keys → Create key. “openrouter/free” picks whichever free model is available (about 50 free requests a day).' },
  anthropic: { label: 'Anthropic (Claude)', needsKey: true, models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'], help: 'Create a key at console.anthropic.com → API keys. Usage is billed to that account.' },
  openai: { label: 'OpenAI-compatible (OpenAI, OpenRouter, LM Studio…)', needsKey: true, base: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o'], help: 'Any service with an OpenAI-style /chat/completions endpoint. Set the base URL and model.' },
  ollama: { label: 'Ollama (free, runs on your computer)', needsKey: false, base: 'http://localhost:11434/v1', models: ['llama3.1', 'mistral', 'qwen2.5'], help: 'Install Ollama, run a model, and start it with OLLAMA_ORIGINS=* so the browser may connect.' },
};

export function getAI() {
  const def = { provider: connected() ? 'cloud' : 'openrouter', key: '', model: '', base: '' };
  try { return { ...def, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return def; }
}
export function setAI(cfg) { localStorage.setItem(KEY, JSON.stringify(cfg)); }
export function aiReady(cfg = getAI()) { const p = PROVIDERS[cfg.provider]; return !!p && (p.server ? connected() : (!p.needsKey || !!cfg.key)); }

export async function complete({ system, user, maxTokens = 2000 }, cfg = getAI()) {
  const p = PROVIDERS[cfg.provider];
  if (!p) throw new Error('Choose an AI provider in AI settings.');
  if (p.server) return serverAI({ system, user, maxTokens });
  const model = cfg.model || p.models[0];
  let res, data;
  try {
    if (cfg.provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      });
    } else {
      const base = (cfg.base || p.base).replace(/\/$/, '');
      res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(cfg.key ? { authorization: 'Bearer ' + cfg.key } : {}), ...(cfg.provider === 'openrouter' ? { 'x-title': 'Loreforge' } : {}) },
        body: JSON.stringify({ model, temperature: 0.9, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
    }
  } catch {
    throw new Error(cfg.provider === 'ollama' ? 'Could not reach Ollama. Is it running, and started with OLLAMA_ORIGINS=* ?' : 'Could not reach the AI service. Check your internet connection.');
  }
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || res.statusText;
    if (res.status === 401) throw new Error('The API key was rejected. Check it in AI settings.');
    if (res.status === 404) throw new Error(`Model “${model}” wasn’t found. Pick another model in AI settings.`);
    if (res.status === 429) throw new Error('Rate limit or credit limit reached on your AI account. Try again shortly.');
    throw new Error(`AI error (${res.status}): ${msg}`);
  }
  const text = cfg.provider === 'anthropic' ? (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('') : data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('The AI returned an empty answer.');
  return text;
}
