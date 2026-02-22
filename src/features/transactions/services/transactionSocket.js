import socket from "../../../utils/socket";

export const txSocketOn = (event, handler) => socket.on(event, handler);
export const txSocketOff = (event, handler) => socket.off(event, handler);

const getGlobalSocket = () =>
  typeof window !== "undefined" && window.socket ? window.socket : null;

export const txGlobalSocketOn = (event, handler) => {
  const s = getGlobalSocket();
  if (!s) return;
  s.on(event, handler);
};

export const txGlobalSocketOff = (event, handler) => {
  const s = getGlobalSocket();
  if (!s) return;
  s.off(event, handler);
};

export const hasGlobalSocket = () => Boolean(getGlobalSocket());
