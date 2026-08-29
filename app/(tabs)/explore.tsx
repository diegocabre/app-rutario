import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { StyleSheet, Text } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

const STORAGE_KEY = "clientes";

interface Cliente {
  id: string;
  nombre: string;
  direccion: string;
  lat?: number;
  lng?: number;
  geoStatus: "pendiente" | "ok" | "error";
}

export default function MapaClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);

  // Recarga la lista cada vez que entras a esta pestaña
  useFocusEffect(
    useCallback(() => {
      cargarClientes();
    }, []),
  );

  const cargarClientes = async (): Promise<void> => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) setClientes(JSON.parse(data));
    } catch (e) {
      console.error("Error cargando clientes", e);
    }
  };

  const clientesUbicados = clientes.filter(
    (c) => c.geoStatus === "ok" && c.lat && c.lng,
  );

  if (clientesUbicados.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.vacio}>
          Aún no tienes clientes ubicados en el mapa
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <MapView
        style={styles.mapa}
        initialRegion={{
          latitude: clientesUbicados[0].lat!,
          longitude: clientesUbicados[0].lng!,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {clientesUbicados.map((cliente) => (
          <Marker
            key={cliente.id}
            coordinate={{ latitude: cliente.lat!, longitude: cliente.lng! }}
            title={cliente.nombre}
            description={cliente.direccion}
          />
        ))}
      </MapView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapa: { flex: 1 },
  vacio: { textAlign: "center", marginTop: 40, color: "#999" },
});
