import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';
import type { MapData } from './types';

export interface OnlineUser {
  user_id: number;
  username: string;
  role: string;
}

export function useSession(campaignId: number) {
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [activeMap, setActiveMap] = useState<MapData | null>(null);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      socket.emit('session:join', { campaign_id: campaignId });
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onState(state: { online: OnlineUser[]; active_map: MapData | null }) {
      setOnline(state.online);
      setActiveMap(state.active_map ?? null);
    }

    function onPresence(data: { online: OnlineUser[] }) {
      setOnline(data.online);
    }

    function onMapSwitched(map: MapData | null) {
      setActiveMap(map);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session:state', onState);
    socket.on('session:presence', onPresence);
    socket.on('map:switched', onMapSwitched);

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:state', onState);
      socket.off('session:presence', onPresence);
      socket.off('map:switched', onMapSwitched);
      socket.disconnect();
    };
  }, [campaignId]);

  return { online, connected, activeMap, setActiveMap };
}
