import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const STORAGE_KEY = "clientes";
const STORAGE_KEY_VISITAS = "visitas";

interface Cliente {
  id: string;
  nombre: string;
  rut?: string;
  direccion: string;
  lat?: number;
  lng?: number;
  geoStatus: "pendiente" | "ok" | "error" | "sin_conexion";
}

interface ClienteConDistancia extends Cliente {
  distanciaKm: number;
}

interface RegistroVisita {
  clienteId: string;
  horaVisita: string;
  nombreCliente: string;
}

type VisitasPorFecha = Record<string, RegistroVisita[]>;

function obtenerFechaHoy(): string {
  return new Date().toISOString().split("T")[0];
}

function calcularDistanciaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function ordenarPorVecinoMasCercano(
  origenLat: number,
  origenLng: number,
  clientes: Cliente[],
): ClienteConDistancia[] {
  const pendientes = [...clientes];
  const ordenados: ClienteConDistancia[] = [];
  let actualLat = origenLat;
  let actualLng = origenLng;

  while (pendientes.length > 0) {
    let indiceMasCercano = 0;
    let distanciaMinima = Infinity;

    pendientes.forEach((cliente, index) => {
      const dist = calcularDistanciaKm(
        actualLat,
        actualLng,
        cliente.lat!,
        cliente.lng!,
      );
      if (dist < distanciaMinima) {
        distanciaMinima = dist;
        indiceMasCercano = index;
      }
    });

    const siguiente = pendientes.splice(indiceMasCercano, 1)[0];
    ordenados.push({ ...siguiente, distanciaKm: distanciaMinima });
    actualLat = siguiente.lat!;
    actualLng = siguiente.lng!;
  }

  return ordenados;
}

export default function RutaDelDia() {
  const [ruta, setRuta] = useState<ClienteConDistancia[]>([]);
  const [visitadosHoy, setVisitadosHoy] = useState<RegistroVisita[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarVisitasHoy = async (): Promise<RegistroVisita[]> => {
    const data = await AsyncStorage.getItem(STORAGE_KEY_VISITAS);
    const todasLasVisitas: VisitasPorFecha = data ? JSON.parse(data) : {};
    return todasLasVisitas[obtenerFechaHoy()] ?? [];
  };

  const calcularRuta = useCallback(async (): Promise<void> => {
    setCargando(true);
    setError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Necesitamos permiso de ubicación para calcular tu ruta");
        setCargando(false);
        return;
      }

      const posicion = await Location.getCurrentPositionAsync({});
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      const clientes: Cliente[] = data ? JSON.parse(data) : [];
      const visitas = await cargarVisitasHoy();
      setVisitadosHoy(visitas);

      const idsVisitados = new Set(visitas.map((v) => v.clienteId));

      const clientesUbicados = clientes.filter(
        (c) =>
          c.geoStatus === "ok" && c.lat && c.lng && !idsVisitados.has(c.id),
      );

      const rutaOrdenada = ordenarPorVecinoMasCercano(
        posicion.coords.latitude,
        posicion.coords.longitude,
        clientesUbicados,
      );

      setRuta(rutaOrdenada);
    } catch (e) {
      console.error(e);
      setError("No se pudo calcular la ruta");
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      calcularRuta();
    }, [calcularRuta]),
  );

  const marcarVisitado = async (
    cliente: ClienteConDistancia,
  ): Promise<void> => {
    const data = await AsyncStorage.getItem(STORAGE_KEY_VISITAS);
    const todasLasVisitas: VisitasPorFecha = data ? JSON.parse(data) : {};
    const hoy = obtenerFechaHoy();
    const visitasDeHoy = todasLasVisitas[hoy] ?? [];

    const nuevaVisita: RegistroVisita = {
      clienteId: cliente.id,
      nombreCliente: cliente.nombre,
      horaVisita: new Date().toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    todasLasVisitas[hoy] = [...visitasDeHoy, nuevaVisita];
    await AsyncStorage.setItem(
      STORAGE_KEY_VISITAS,
      JSON.stringify(todasLasVisitas),
    );

    setVisitadosHoy(todasLasVisitas[hoy]);
    setRuta((prev) => prev.filter((c) => c.id !== cliente.id));
  };

  const deshacerVisita = async (clienteId: string): Promise<void> => {
    const data = await AsyncStorage.getItem(STORAGE_KEY_VISITAS);
    const todasLasVisitas: VisitasPorFecha = data ? JSON.parse(data) : {};
    const hoy = obtenerFechaHoy();
    todasLasVisitas[hoy] = (todasLasVisitas[hoy] ?? []).filter(
      (v) => v.clienteId !== clienteId,
    );
    await AsyncStorage.setItem(
      STORAGE_KEY_VISITAS,
      JSON.stringify(todasLasVisitas),
    );
    setVisitadosHoy(todasLasVisitas[hoy]);
    calcularRuta();
  };

  const abrirWaze = async (cliente: ClienteConDistancia): Promise<void> => {
    const url = `waze://?ll=${cliente.lat},${cliente.lng}&navigate=yes`;
    const puedeAbrir = await Linking.canOpenURL(url);

    if (puedeAbrir) {
      Linking.openURL(url);
    } else {
      Linking.openURL(
        `https://waze.com/ul?ll=${cliente.lat},${cliente.lng}&navigate=yes`,
      );
    }
  };

  const abrirGoogleMaps = (cliente: ClienteConDistancia): void => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${cliente.lat},${cliente.lng}`;
    Linking.openURL(url);
  };

  const elegirNavegacion = (cliente: ClienteConDistancia): void => {
    Alert.alert("Navegar con", `¿Cómo quieres llegar a ${cliente.nombre}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Waze", onPress: () => abrirWaze(cliente) },
      { text: "Google Maps", onPress: () => abrirGoogleMaps(cliente) },
    ]);
  };

  if (cargando) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
        <Text style={styles.vacio}>Calculando tu ruta...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.vacio}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>Tu Ruta de Hoy</Text>
        <TouchableOpacity onPress={calcularRuta}>
          <Text style={styles.recalcular}>🔄 Recalcular</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.contador}>
        {ruta.length} pendientes · {visitadosHoy.length} visitados hoy
      </Text>

      <FlatList
        style={{ flex: 1 }}
        data={ruta}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.vacio}>
            {visitadosHoy.length > 0
              ? "¡Visitaste a todos tus clientes de hoy! 🎉"
              : "No hay clientes ubicados aún"}
          </Text>
        }
        renderItem={({ item, index }) => (
          <View style={styles.tarjeta}>
            <View style={styles.numero}>
              <Text style={styles.numeroTexto}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombreCliente}>{item.nombre}</Text>
              <Text style={styles.direccionCliente}>{item.direccion}</Text>
              <Text style={styles.distancia}>
                {item.distanciaKm.toFixed(1)} km
              </Text>
            </View>
            <View style={styles.botonesAccion}>
              <TouchableOpacity
                style={styles.botonNav}
                onPress={() => elegirNavegacion(item)}
              >
                <Text style={styles.botonNavTexto}>🧭 Ir</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.botonVisitado}
                onPress={() => marcarVisitado(item)}
              >
                <Text style={styles.botonVisitadoTexto}>✓ Visité</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {visitadosHoy.length > 0 && (
        <View style={styles.seccionVisitados}>
          <Text style={styles.subtitulo}>Visitados hoy</Text>
          <FlatList
            data={visitadosHoy}
            keyExtractor={(item) => item.clienteId}
            renderItem={({ item }) => (
              <View style={styles.filaVisitado}>
                <Text style={styles.textoVisitado}>
                  ✅ {item.nombreCliente} · {item.horaVisita}
                </Text>
                <TouchableOpacity
                  onPress={() => deshacerVisita(item.clienteId)}
                >
                  <Text style={styles.deshacer}>Deshacer</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5", padding: 16 },
  encabezado: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titulo: { fontSize: 24, fontWeight: "bold" },
  recalcular: { color: "#2563eb", fontSize: 13 },
  contador: { color: "#666", marginTop: 4, marginBottom: 12, fontSize: 13 },
  vacio: { textAlign: "center", color: "#999", marginTop: 24 },
  tarjeta: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  numero: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  numeroTexto: { color: "#fff", fontWeight: "bold" },
  nombreCliente: { fontSize: 16, fontWeight: "600" },
  direccionCliente: { fontSize: 14, color: "#666", marginTop: 2 },
  distancia: { fontSize: 12, color: "#999", marginTop: 2 },
  botonesAccion: { gap: 6 },
  botonNav: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  botonNavTexto: { color: "#fff", fontWeight: "bold", textAlign: "center" },
  botonVisitado: {
    backgroundColor: "#e5e7eb",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  botonVisitadoTexto: { color: "#374151", fontWeight: "600", fontSize: 12 },
  seccionVisitados: {
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    paddingTop: 8,
    maxHeight: 140,
  },
  subtitulo: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
  },
  filaVisitado: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  textoVisitado: { color: "#374151", fontSize: 13 },
  deshacer: { color: "#e11d48", fontSize: 12 },
});
