/**
 * state.js — Lightweight reactive state store
 */

const _state = {
  user:        null,   // { username, role }
  host:        null,   // host metrics object
  containers:  [],     // array of container objects with stats
  sseStatus:   'disconnected', // 'connected' | 'disconnected'
};

const _listeners = new Map();

function subscribe(key, fn) {
  if (!_listeners.has(key)) _listeners.set(key, new Set());
  _listeners.get(key).add(fn);
  // Call immediately with current value
  fn(_state[key]);
  return () => _listeners.get(key)?.delete(fn);
}

function set(key, value) {
  _state[key] = value;
  _listeners.get(key)?.forEach(fn => fn(value));
}

function get(key) {
  return _state[key];
}

// Containers helpers
function updateContainer(updated) {
  const existing = _state.containers.findIndex(c => c.id === updated.id);
  if (existing >= 0) {
    _state.containers[existing] = { ..._state.containers[existing], ...updated };
  } else {
    _state.containers.push(updated);
  }
  _listeners.get('containers')?.forEach(fn => fn([..._state.containers]));
}

function setContainers(list) {
  set('containers', list);
}

function getContainer(id) {
  return _state.containers.find(c => c.id === id) || null;
}

export const state = {
  subscribe,
  set,
  get,
  updateContainer,
  setContainers,
  getContainer,
};
