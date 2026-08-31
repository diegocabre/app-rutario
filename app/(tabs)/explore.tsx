import { useCallback, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MapView, { Marker, MapPressEvent, MarkerDragStartEndEvent } from "react-native-maps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { Cliente } from "@/types/cliente";

const STORAGE_KEY = "clientes";

const REGION_DEFECTO = {
  latitude: -41.3195,
  longitude: -72.9854,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

export default function MapaClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteAjustando, setClienteAjustando] = useState<Cliente | null>(null);
  const [pinTemporal, setPinTemporal] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      cargarClientes();
    }, [])
  );

  const cargarClientes = async (): Promise<void> => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) setClientes(JSON.parse(data));
    } catch (e) {
      console.error("Error cargando clientes", e);
    }
  };

  const clientesConPin = clientes.filter(
    (c) =>
      (c.geoStatus === "ok" || c.geoStatus === "aproximado") && c.lat && c.lng
  );

  const clientesSinUbicar = clientes.filter(
    (c) => c.geoStatus === "error" || c.geoStatus === "no_encontrado"
  );

  const iniciarAjuste = (cliente: Cliente): void => {
    setClienteAjustando(cliente);
    setPinTemporal(
      cliente.lat && cliente.lng
        ? { latitude: cliente.lat, longitude: cliente.lng }
        : {
            latitude: REGION_DEFECTO.latitude,
            longitude: REGION_DEFECTO.longitude,
          }
    );
  };

  const tocarMapa = (evento: MapPressEvent): void => {
    if (!clienteAjustando) return;
    setPinTemporal(evento.nativeEvent.coordinate);
  };

  const arrastrarPin = (evento: MarkerDragStartEndEvent): void => {
    setPinTemporal(evento.nativeEvent.coordinate);
  };

  const guardarAjuste = async (): Promise<void> => {
    if (!clienteAjustando || !pinTemporal) return;

    const data = await AsyncStorage.getItem(STORAGE_KEY);
    const todos: Cliente[] = data ? JSON.parse(data) : [];

    const actualizados = todos.map((c) =>
      c.id === clienteAjustando.id
        ? {
            ...c,
            lat: pinTemporal.latitude,
            lng: pinTemporal.longitude,
            geoStatus: "ok" as const,
          }
        : c
    );

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(actualizados));
    setClientes(actualizados);
    setClienteAjustando(null);
    setPinTemporal(null);
    Alert.alert("Listo", `Ubicación de ${clienteAjustando.nombre} guardada`);
  };

  const cancelarAjuste = (): void => {
    setClienteAjustando(null);
    setPinTemporal(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {clienteAjustando ? (
        <View style={styles.bannerAjuste}>
          <Text style={styles.bannerAjusteTexto}>
            📍 Arrastra el pin azul o toca el mapa para ubicar a{" "}
            {clienteAjustando.nombre}
          </Text>
          <View style={styles.bannerBotones}>
            <TouchableOpacity onPress={cancelarAjuste}>
              <Text style={styles.bannerCancelar}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={guardarAjuste}
              style={styles.bannerGuardarBoton}
            >
              <Text style={styles.bannerGuardarTexto}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.bannerAyuda}>
          <Text style={styles.bannerAyudaTexto}>
            💡 Toca cualquier pin para corregir su ubicación exacta
          </Text>
        </View>
      )}

      <MapView
        style={styles.mapa}
        initialRegion={
          clientesConPin.length > 0
            ? {
                latitude: clientesConPin[0].lat!,
                longitude: clientesConPin[0].lng!,
                latitudeDelta: 0.15,
                longitudeDelta: 0.15,
              }
            : REGION_DEFECTO
        }
        onPress={tocarMapa}
      >
        {clientesConPin
          .filter((c) => c.id !== clienteAjustando?.id)
          .map((cliente) => (
            <Marker
              key={cliente.id}
              coordinate={{ latitude: cliente.lat!, longitude: cliente.lng! }}
              title={cliente.nombre}
              description={`${cliente.direccion} · Toca para reubicar`}
              pinColor={cliente.geoStatus === "aproximado" ? "orange" : "red"}
              onPress={() => iniciarAjuste(cliente)}
            />
          ))}

        {pinTemporal && (
          <Marker
            coordinate={pinTemporal}
            pinColor="blue"
            title="Nueva ubicación"
            draggable
            onDragEnd={arrastrarPin}
          />
        )}
      </MapView>

      {!clienteAjustando && clientesSinUbicar.length > 0 && (
        <View style={styles.listaPorCorregir}>
          <Text style={styles.tituloLista}>
            Sin ubicar todavía ({clientesSinUbicar.length})
          </Text>
          {clientesSinUbicar.slice(0, 4).map((cliente) => (
            <TouchableOpacity
              key={cliente.id}
              style={styles.filaPorCorregir}
              onPress={() => iniciarAjuste(cliente)}
            >
              <Text style={styles.nombrePorCorregir}>{cliente.nombre}</Text>
              <Text style={styles.tocarTexto}>Ubicar →</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapa: { flex: 1 },
  bannerAjuste: {
    backgroundColor: "#dbeafe",
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bannerAjusteTexto: { flex: 1, fontSize: 13, color: "#1e40af" },
  bannerBotones: { flexDirection: "row", gap: 12, alignItems: "center" },
  bannerCancelar: { color: "#6b7280", fontSize: 13 },
  bannerGuardarBoton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  bannerGuardarTexto: { color: "#fff", fontWeight: "600", fontSize: 13 },
  bannerAyuda: { backgroundColor: "#f3f4f6", padding: 8 },
  bannerAyudaTexto: { fontSize: 12, color: "#6b7280", textAlign: "center" },
  listaPorCorregir: {
    backgroundColor: "#fff",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    maxHeight: 180,
  },
  tituloLista: { fontWeight: "600", marginBottom: 6, color: "#374151" },
  filaPorCorregir: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  nombrePorCorregir: { fontSize: 14, color: "#374151" },
  tocarTexto: { fontSize: 13, color: "#2563eb" },
});