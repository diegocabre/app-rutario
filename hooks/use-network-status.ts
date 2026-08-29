import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export function useNetworkStatus(): boolean {
  const [conectado, setConectado] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((estado) => {
      setConectado(
        !!estado.isConnected && estado.isInternetReachable !== false,
      );
    });

    return () => unsubscribe();
  }, []);

  return conectado;
}
