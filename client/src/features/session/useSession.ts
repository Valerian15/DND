import { useCallback, useEffect, useState } from 'react';
import { socket } from '../../lib/socket';
import type { MapData, TokenData, ChatMessage, InitiativeEntry, WallSegment } from './types';
import { listTokens } from './tokenApi';
import { listWalls, getFog } from './wallApi';

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
  const [walls, setWalls] = useState<WallSegment[]>([]);
  const [fogVisible, setFogVisible] = useState<[number, number][]>([]);
  const [fogExplored, setFogExplored] = useState<[number, number][]>([]);

  const fetchTokens = useCallback((mapId: number) => {
    listTokens(mapId).then(setTokens).catch(() => {});
  }, []);

  const fetchWallsAndFog = useCallback((mapId: number) => {
    listWalls(mapId).then(setWalls).catch(() => {});
    getFog(mapId).then((f) => { setFogVisible(f.visible); setFogExplored(f.explored); }).catch(() => {});
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
      walls?: WallSegment[];
      fog_visible?: [number, number][];
      fog_explored?: [number, number][];
    }) {
      setOnline(state.online);
      setActiveMap(state.active_map ?? null);
      if (state.active_map) fetchTokens(state.active_map.id);
      else setTokens([]);
      if (state.chat_history) setMessages(state.chat_history);
      if (state.initiative) setInitiative(state.initiative);
      if (state.walls) setWalls(state.walls);
      if (state.fog_visible) setFogVisible(state.fog_visible);
      if (state.fog_explored) setFogExplored(state.fog_explored);
    }

    function onPresence(data: { online: OnlineUser[] }) {
      setOnline(data.online);
    }

    function onMapSwitched(map: MapData | null) {
      setActiveMap(map);
      if (map) {
        fetchTokens(map.id);
        fetchWallsAndFog(map.id);
      } else {
        setTokens([]);
        setWalls([]);
        setFogVisible([]);
        setFogExplored([]);
      }
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

    function onWallCreated(wall: WallSegment) {
      setWalls((prev) => [...prev, wall]);
    }

    function onWallDeleted(data: { wall_id: number }) {
      setWalls((prev) => prev.filter((w) => w.id !== data.wall_id));
    }

    function onWallCleared() {
      setWalls([]);
    }

    function onFogUpdate(fog: { visible: [number, number][]; explored: [number, number][] }) {
      setFogVisible(fog.visible);
      setFogExplored(fog.explored);
    }

    function onFogToggled(data: { map_id: number; fog_enabled: number }) {
      setActiveMap((prev) => prev && prev.id === data.map_id ? { ...prev, fog_enabled: data.fog_enabled } : prev);
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
    socket.on('wall:created', onWallCreated);
    socket.on('wall:deleted', onWallDeleted);
    socket.on('wall:cleared', onWallCleared);
    socket.on('fog:update', onFogUpdate);
    socket.on('map:fog_toggled', onFogToggled);

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
      socket.off('wall:created', onWallCreated);
      socket.off('wall:deleted', onWallDeleted);
      socket.off('wall:cleared', onWallCleared);
      socket.off('fog:update', onFogUpdate);
      socket.off('map:fog_toggled', onFogToggled);
      socket.disconnect();
    };
  }, [campaignId, fetchTokens, fetchWallsAndFog]);

  return {
    online, connected,
    activeMap, setActiveMap,
    tokens, setTokens,
    messages, initiative,
    walls, fogVisible, fogExplored,
  };
}
