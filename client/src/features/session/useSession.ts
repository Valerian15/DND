import { useEffect, useState } from 'react';
import { socket } from '../../lib/socket';

export interface OnlineUser {
  user_id: number;
  username: string;
  role: string;
}

export function useSession(campaignId: number) {
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      socket.emit('session:join', { campaign_id: campaignId });
    }

    function onDisconnect() {
      setConnected(false);
    }

    function onState(state: { online: OnlineUser[] }) {
      setOnline(state.online);
    }

    function onPresence(data: { online: OnlineUser[] }) {
      setOnline(data.online);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session:state', onState);
    socket.on('session:presence', onPresence);

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:state', onState);
      socket.off('session:presence', onPresence);
      socket.disconnect();
    };
  }, [campaignId]);

  return { online, connected };
}
