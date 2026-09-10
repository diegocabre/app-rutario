import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback } from "react";
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

import { useClientes } from "@/context/ClientesContext";
import { obtenerEstadoPrioridad } from "@/services/prioridad";
import { ClienteConDistancia } from "@/types/cliente";

export default function RutaDelDia() {
  const router = useRouter();
  const {
    ruta,
    visitadosHoy,
    kmRecorridosReales,
    cargandoRuta,
    errorRuta,
    calcularRuta,
    marcarVisitado,
    deshacerVisita,
    setModoMapa,
    enviarReporteDelDia,
  } = useClientes();

  useFocusEffect(
    useCallback(() => {
      calcularRuta();
    }, [calcularRuta]),
  );

  const irAlMapa = () => {
    setModoMapa("recorrido");
    router.push("/(tabs)/explore");
  };
  const handleEnviarReporte = async (): Promise<void> => {
    if (visitadosHoy.length === 0) {
      Alert.alert(
        "Sin visitas registradas",
        "Aún no has marcado ninguna visita hoy. ¿Quieres enviar el reporte de todas formas?",
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Enviar igual", onPress: () => enviarReporteDelDia() },
        ],
      );
      return;
    }
    await enviarReporteDelDia();
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

  if (cargandoRuta && ruta.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" style={{ marginTop: 40 }} />
        <Text style={styles.vacio}>Calculando tu ruta y kilometraje...</Text>
      </SafeAreaView>
    );
  }

  if (errorRuta && ruta.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.vacio}>{errorRuta}</Text>
        <TouchableOpacity style={styles.botonReintentar} onPress={calcularRuta}>
          <Text style={styles.botonReintentarTexto}>Reintentar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Encabezado Principal */}
      <View style={styles.encabezado}>
        <Text style={styles.titulo}>Tu Ruta de Hoy</Text>
        <TouchableOpacity onPress={calcularRuta}>
          <Text style={styles.recalcular}>🔄 Recalcular</Text>
        </TouchableOpacity>
      </View>

      {/* Tarjeta Destacada de Kilometraje y Acceso al Mapa */}
      <View style={styles.tarjetaKilometraje}>
        <View style={styles.infoKilometraje}>
          <Text style={styles.etiquetaKm}>RECORRIDO REAL EN VIVO</Text>
          <Text style={styles.valorKm}>{kmRecorridosReales.toFixed(2)} km</Text>
          <Text style={styles.resumenParadas}>
            {ruta.length} clientes pendientes · {visitadosHoy.length} visitados
          </Text>
        </View>

        <View style={styles.columnaBotones}>
          <TouchableOpacity style={styles.botonVerMapa} onPress={irAlMapa}>
            <Text style={styles.botonVerMapaTexto}>🗺️ Ver mi Ruta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.botonEnviarReporte}
            onPress={handleEnviarReporte}
          >
            <Text style={styles.botonEnviarReporteTexto}>
              📧 Enviar reporte
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Lista de Paradas Ordenadas */}
      <FlatList
        style={{ flex: 1 }}
        data={ruta}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.vacio}>
            {visitadosHoy.length > 0
              ? "¡Completaste todas las visitas de hoy! 🎉"
              : "No hay clientes ubicados con coordenadas para hoy"}
          </Text>
        }
        renderItem={({ item, index }) => {
          const prioridad = obtenerEstadoPrioridad(item.ultimaVisita);

          return (
            <View style={styles.tarjeta}>
              <View style={styles.numero}>
                <Text style={styles.numeroTexto}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <Text style={styles.nombreCliente}>{item.nombre}</Text>
                  <View
                    style={[
                      styles.badgePrioridad,
                      { backgroundColor: prioridad.fondoHex },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgePrioridadTexto,
                        { color: prioridad.textoColorHex },
                      ]}
                    >
                      {prioridad.badgeTexto}
                    </Text>
                  </View>
                  {item.geoStatus === "aproximado" && (
                    <View style={styles.badgeAprox}>
                      <Text style={styles.badgeAproxTexto}>Aprox.</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.direccionCliente}>{item.direccion}</Text>
                <Text style={styles.distancia}>
                  +{item.distanciaKm.toFixed(1)} km desde parada anterior
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
          );
        }}
      />

      {/* Sección de Clientes Visitados Hoy */}
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
  recalcular: { color: "#2563eb", fontSize: 13, fontWeight: "600" },
  vacio: { textAlign: "center", color: "#999", marginTop: 28, fontSize: 15 },
  tarjetaKilometraje: {
    backgroundColor: "#1e3a8a",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoKilometraje: { flex: 1 },
  etiquetaKm: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  valorKm: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "bold",
    marginVertical: 2,
  },
  resumenParadas: {
    color: "#e0e7ff",
    fontSize: 12,
  },
  botonVerMapa: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  botonVerMapaTexto: {
    color: "#1e3a8a",
    fontWeight: "bold",
    fontSize: 13,
  },
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
  badgeAprox: {
    backgroundColor: "#ffedd5",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeAproxTexto: {
    color: "#c2410c",
    fontSize: 10,
    fontWeight: "700",
  },
  direccionCliente: { fontSize: 14, color: "#666", marginTop: 2 },
  distancia: {
    fontSize: 12,
    color: "#2563eb",
    marginTop: 2,
    fontWeight: "500",
  },
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
  botonReintentar: {
    backgroundColor: "#2563eb",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 12,
  },
  botonReintentarTexto: {
    color: "#fff",
    fontWeight: "600",
  },
  badgePrioridad: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgePrioridadTexto: {
    fontSize: 10,
    fontWeight: "700",
  },
  columnaBotones: { gap: 8 },
  botonEnviarReporte: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  botonEnviarReporteTexto: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
  },
});
