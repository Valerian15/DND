import { useCallback, useEffect, useState } from 'react';
import { socket } from '../../lib/socket';
import type { MapData, TokenData, ChatMessage, InitiativeEntry } from './types';
import { listTokens } from './tokenApi';

export interface OnlineUser {
  user_id: number;
  username: string;
  role: string;
}

export function useSession(campaignId: number) {
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeMap, setActiveMap] = useState<MapData | null>(null);
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [initiative, setInitiative] = useState<InitiativeEntry[]>([]);

  const fetchTokens = useCallback((mapId: number) => {
    listTokens(mapId).then(setTokens).catch(() => {});
  }, []);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      socket.emit('session:join', { campaign_id: campaignId });
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onState(state: {
      online: OnlineUser[];
      active_map: MapData | null;
      chat_history?: ChatMessage[];
      initiative?: InitiativeEntry[];
    }) {
      setOnline(state.online);
      setActiveMap(state.active_map ?? null);
      if (state.active_map) fetchTokens(state.active_map.id);
      else setTokens([]);
      if (state.chat_history) setMessages(state.chat_history);
      if (state.initiative) setInitiative(state.initiative);
    }

    function onPresence(data: { online: OnlineUser[] }) {
      setOnline(data.online);
    }

    function onMapSwitched(map: MapData | null) {
      setActiveMap(map);
      if (map) fetchTokens(map.id);
      else setTokens([]);
    }

    function onTokenCreated(token: TokenData) {
      setTokens((prev) => prev.some((t) => t.id === token.id) ? prev : [...prev, token]);
    }

    function onTokenMoved(data: { token_id: number; col: number; row: number }) {
      setTokens((prev) =>
        prev.map((t) => t.id === data.token_id ? { ...t, col: data.col, row: data.row } : t)
      );
    }

    function onTokenDeleted(data: { token_id: number }) {
      setTokens((prev) => prev.filter((t) => t.id !== data.token_id));
    }

    function onTokenHpUpdated(data: { token_id: number; hp_current: number }) {
      setTokens((prev) =>
        prev.map((t) => t.id === data.token_id ? { ...t, hp_current: data.hp_current } : t)
      );
    }

    function onTokenConditionsUpdated(data: { token_id: number; conditions: string[] }) {
      setTokens((prev) =>
        prev.map((t) => t.id === data.token_id ? { ...t, conditions: data.conditions } : t)
      );
    }

    function onChatMessage(msg: ChatMessage) {
      setMessages((prev) => [...prev, msg]);
    }

    function onInitiativeUpdated(entries: InitiativeEntry[]) {
      setInitiative(entries);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session:state', onState);
    socket.on('session:presence', onPresence);
    socket.on('map:switched', onMapSwitched);
    socket.on('token:created', onTokenCreated);
    socket.on('token:moved', onTokenMoved);
    socket.on('token:deleted', onTokenDeleted);
    socket.on('token:hp_updated', onTokenHpUpdated);
    socket.on('token:conditions_updated', onTokenConditionsUpdated);
    socket.on('chat:message', onChatMessage);
    socket.on('initiative:updated', onInitiativeUpdated);

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:state', onState);
      socket.off('session:presence', onPresence);
      socket.off('map:switched', onMapSwitched);
      socket.off('token:created', onTokenCreated);
      socket.off('token:moved', onTokenMoved);
      socket.off('token:deleted', onTokenDeleted);
      socket.off('token:hp_updated', onTokenHpUpdated);
      socket.off('token:conditions_updated', onTokenConditionsUpdated);
      socket.off('chat:message', onChatMessage);
      socket.off('initiative:updated', onInitiativeUpdated);
      socket.disconnect();
    };
  }, [campaignId, fetchTokens]);

  return { online, connected, activeMap, setActiveMap, tokens, setTokens, messages, initiative };
}
