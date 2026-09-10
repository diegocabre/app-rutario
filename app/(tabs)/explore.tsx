import { useFocusEffect } from "@react-navigation/native";
import { useKeepAwake } from "expo-keep-awake";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  MapPressEvent,
  Marker,
  MarkerDragStartEndEvent,
  Polyline,
} from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { useClientes } from "@/context/ClientesContext";
import { obtenerEstadoPrioridad } from "@/services/prioridad";
import { Cliente, NivelPrioridadVisita } from "@/types/cliente";

const REGION_DEFECTO = {
  latitude: -41.3195,
  longitude: -72.9854,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

type FiltroPrioridad = "todos" | NivelPrioridadVisita;

export default function MapaClientes() {
  useKeepAwake();

  const {
    clientes,
    actualizarUbicacionManual,
    posicionVendedor,
    trayectoriaReal,
    kmRecorridosReales,
    grabandoRuta,
    pausarTracking,
    reanudarTracking,
    reiniciarTrayectoriaHoy,
    calcularRuta,
    ruta,
    marcarVisitado,
    visitadosHoy,
  } = useClientes();

  const [clienteAjustando, setClienteAjustando] = useState<Cliente | null>(
    null,
  );
  const [clienteSeleccionado, setClienteSeleccionado] =
    useState<Cliente | null>(null);
  const [pinTemporal, setPinTemporal] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Filtro de prioridad (Semáforo de calor)
  const [filtroPrioridad, setFiltroPrioridad] =
    useState<FiltroPrioridad>("todos");

  useFocusEffect(
    useCallback(() => {
      if (ruta.length === 0 && clientes.length > 0) {
        calcularRuta();
      }
    }, [calcularRuta, ruta.length, clientes.length]),
  );

  const clientesConPin = clientes.filter(
    (c) =>
      (c.geoStatus === "ok" || c.geoStatus === "aproximado") && c.lat && c.lng,
  );

  // Contadores para el semáforo / mapa de calor
  const conteoPrioridades = useMemo(() => {
    let urgentes = 0;
    let media = 0;
    let alDia = 0;

    clientesConPin.forEach((c) => {
      const p = obtenerEstadoPrioridad(c.ultimaVisita);
      if (p.nivel === "urgente") urgentes++;
      else if (p.nivel === "media") media++;
      else if (p.nivel === "al_dia") alDia++;
    });

    return { urgentes, media, alDia, total: clientesConPin.length };
  }, [clientesConPin]);

  // Clientes filtrados por semáforo
  const clientesFiltrados = useMemo(() => {
    if (filtroPrioridad === "todos") return clientesConPin;
    return clientesConPin.filter((c) => {
      const p = obtenerEstadoPrioridad(c.ultimaVisita);
      return p.nivel === filtroPrioridad;
    });
  }, [clientesConPin, filtroPrioridad]);

  const clientesSinUbicar = clientes.filter(
    (c) =>
      c.geoStatus === "error" ||
      c.geoStatus === "no_encontrado" ||
      c.geoStatus === "sin_conexion",
  );
  const clientesAproximados = clientes.filter(
    (c) => c.geoStatus === "aproximado",
  );

  const iniciarAjuste = (cliente: Cliente): void => {
    setClienteAjustando(cliente);
    setPinTemporal(
      cliente.lat && cliente.lng
        ? { latitude: cliente.lat, longitude: cliente.lng }
        : {
            latitude: REGION_DEFECTO.latitude,
            longitude: REGION_DEFECTO.longitude,
          },
    );
  };

  const tocarMapa = (evento: MapPressEvent): void => {
    if (clienteAjustando) {
      setPinTemporal(evento.nativeEvent.coordinate);
    } else {
      setClienteSeleccionado(null);
    }
  };

  const arrastrarPin = (evento: MarkerDragStartEndEvent): void => {
    setPinTemporal(evento.nativeEvent.coordinate);
  };

  const guardarAjuste = async (): Promise<void> => {
    if (!clienteAjustando || !pinTemporal) return;

    await actualizarUbicacionManual(
      clienteAjustando.id,
      pinTemporal.latitude,
      pinTemporal.longitude,
    );
    setClienteAjustando(null);
    setPinTemporal(null);
    Alert.alert("Listo", `Ubicación de ${clienteAjustando.nombre} guardada`);
  };

  const cancelarAjuste = (): void => {
    setClienteAjustando(null);
    setPinTemporal(null);
  };

  const abrirWaze = async (lat: number, lng: number): Promise<void> => {
    const url = `waze://?ll=${lat},${lng}&navigate=yes`;
    const puedeAbrir = await Linking.canOpenURL(url);
    if (puedeAbrir) {
      Linking.openURL(url);
    } else {
      Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`);
    }
  };

  const abrirGoogleMaps = (lat: number, lng: number): void => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(url);
  };

  const elegirNavegacion = (cliente: Cliente): void => {
    if (!cliente.lat || !cliente.lng) return;
    Alert.alert("Navegar con", `¿Cómo quieres llegar a ${cliente.nombre}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Waze", onPress: () => abrirWaze(cliente.lat!, cliente.lng!) },
      {
        text: "Google Maps",
        onPress: () => abrirGoogleMaps(cliente.lat!, cliente.lng!),
      },
    ]);
  };

  const manejarMarcarVisitado = async (cliente: Cliente): Promise<void> => {
    await marcarVisitado(cliente);
    setClienteSeleccionado({
      ...cliente,
      ultimaVisita: new Date().toISOString(),
    });
  };

  // Coordenadas de la trayectoria REAL que va recorriendo el vendedor
  const puntosRecorridoReal = trayectoriaReal.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
  }));

  if (
    posicionVendedor &&
    puntosRecorridoReal.length > 0 &&
    (puntosRecorridoReal[puntosRecorridoReal.length - 1].latitude !==
      posicionVendedor.latitude ||
      puntosRecorridoReal[puntosRecorridoReal.length - 1].longitude !==
        posicionVendedor.longitude)
  ) {
    puntosRecorridoReal.push(posicionVendedor);
  }

  const initialRegion = posicionVendedor
    ? {
        latitude: posicionVendedor.latitude,
        longitude: posicionVendedor.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : clientesConPin.length > 0
      ? {
          latitude: clientesConPin[0].lat!,
          longitude: clientesConPin[0].lng!,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }
      : REGION_DEFECTO;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Barra de Filtros del Mapa de Calor (Semáforo de Prioridades) */}
      <View style={styles.contenedorFiltros}>
        <Text style={styles.tituloFiltro}>Prioridad de Visitas:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollFiltros}
        >
          <TouchableOpacity
            style={[
              styles.chipFiltro,
              filtroPrioridad === "todos" && styles.chipFiltroActivo,
            ]}
            onPress={() => setFiltroPrioridad("todos")}
          >
            <Text
              style={[
                styles.chipFiltroTexto,
                filtroPrioridad === "todos" && styles.chipFiltroTextoActivo,
              ]}
            >
              Todos ({conteoPrioridades.total})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.chipFiltro,
              styles.chipRojo,
              filtroPrioridad === "urgente" && styles.chipRojoActivo,
            ]}
            onPress={() => setFiltroPrioridad("urgente")}
          >
            <Text
              style={[
                styles.chipFiltroTexto,
                styles.chipRojoTexto,
                filtroPrioridad === "urgente" && styles.chipFiltroTextoActivo,
              ]}
            >
              🔴 &gt;30 días ({conteoPrioridades.urgentes})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.chipFiltro,
              styles.chipAmarillo,
              filtroPrioridad === "media" && styles.chipAmarilloActivo,
            ]}
            onPress={() => setFiltroPrioridad("media")}
          >
            <Text
              style={[
                styles.chipFiltroTexto,
                styles.chipAmarilloTexto,
                filtroPrioridad === "media" && styles.chipFiltroTextoActivo,
              ]}
            >
              🟡 15-30 días ({conteoPrioridades.media})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.chipFiltro,
              styles.chipVerde,
              filtroPrioridad === "al_dia" && styles.chipVerdeActivo,
            ]}
            onPress={() => setFiltroPrioridad("al_dia")}
          >
            <Text
              style={[
                styles.chipFiltroTexto,
                styles.chipVerdeTexto,
                filtroPrioridad === "al_dia" && styles.chipFiltroTextoActivo,
              ]}
            >
              🟢 &lt;15 días ({conteoPrioridades.alDia})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Banner de Ajuste Manual */}
      {clienteAjustando && (
        <View style={styles.bannerAjuste}>
          <Text style={styles.bannerAjusteTexto}>
            📍 Toca el mapa o arrastra el pin azul para ubicar a{" "}
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
      )}

      <MapView
        style={styles.mapa}
        initialRegion={initialRegion}
        onPress={tocarMapa}
        showsUserLocation={false}
      >
        {/* Línea Azul del Recorrido Real del Vendedor */}
        {puntosRecorridoReal.length > 1 && (
          <Polyline
            coordinates={puntosRecorridoReal}
            strokeColor="#2563eb"
            strokeWidth={5}
          />
        )}

        {/* Marcador en Vivo del Vendedor */}
        {/* Marcador en Vivo del Vendedor — punto azul distintivo, no confundible con pines de clientes */}
        {posicionVendedor && (
          <Marker
            coordinate={posicionVendedor}
            title="📍 Tú estás aquí"
            description="Tu ubicación actual en vivo"
            anchor={{ x: 0.5, y: 0.5 }}
            flat
          >
            <View style={styles.puntoVendedorHalo}>
              <View style={styles.puntoVendedorCentro} />
            </View>
          </Marker>
        )}

        {/* Pines de los Clientes con Semáforo de Calor */}
        {clientesFiltrados
          .filter((c) => c.id !== clienteAjustando?.id)
          .map((cliente) => {
            const prioridad = obtenerEstadoPrioridad(cliente.ultimaVisita);

            return (
              <Marker
                key={`pin-${cliente.id}-${cliente.ultimaVisita || "sin-visita"}-${prioridad.colorPin}`}
                coordinate={{ latitude: cliente.lat!, longitude: cliente.lng! }}
                title={`${prioridad.badgeTexto} · ${cliente.nombre}`}
                description={`${cliente.direccion} — ${prioridad.etiqueta}`}
                pinColor={prioridad.colorPin}
                onPress={() => {
                  if (clienteAjustando) {
                    iniciarAjuste(cliente);
                  } else {
                    setClienteSeleccionado(cliente);
                  }
                }}
              />
            );
          })}

        {/* Pin temporal para ajuste */}
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

      {/* Tarjeta Flotante de Cliente Seleccionado en el Mapa */}
      {clienteSeleccionado &&
        !clienteAjustando &&
        (() => {
          const prioridad = obtenerEstadoPrioridad(
            clienteSeleccionado.ultimaVisita,
          );
          const yaVisitadoHoy = visitadosHoy.some(
            (v) => v.clienteId === clienteSeleccionado.id,
          );

          return (
            <View style={styles.tarjetaClienteFlotante}>
              <View style={styles.encabezadoClienteFlotante}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <Text
                      style={styles.nombreClienteFlotante}
                      numberOfLines={1}
                    >
                      {clienteSeleccionado.nombre}
                    </Text>
                    <View
                      style={[
                        styles.badgePrioridadFlotante,
                        { backgroundColor: prioridad.fondoHex },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgePrioridadFlotanteTexto,
                          { color: prioridad.textoColorHex },
                        ]}
                      >
                        {prioridad.badgeTexto}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={styles.direccionClienteFlotante}
                    numberOfLines={1}
                  >
                    {clienteSeleccionado.direccion}
                  </Text>
                  <Text style={styles.etiquetaClienteFlotante}>
                    {prioridad.etiqueta}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setClienteSeleccionado(null)}
                  style={styles.botonCerrarCard}
                >
                  <Text style={styles.botonCerrarTexto}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.accionesClienteFlotante}>
                <TouchableOpacity
                  style={styles.botonAccionNav}
                  onPress={() => elegirNavegacion(clienteSeleccionado)}
                >
                  <Text style={styles.botonAccionNavTexto}>🧭 Ir</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.botonAccionVisitar,
                    yaVisitadoHoy && styles.botonAccionYaVisitado,
                  ]}
                  onPress={() => manejarMarcarVisitado(clienteSeleccionado)}
                >
                  <Text
                    style={[
                      styles.botonAccionVisitarTexto,
                      yaVisitadoHoy && styles.botonAccionYaVisitadoTexto,
                    ]}
                  >
                    {yaVisitadoHoy ? "✅ Visitado hoy" : "✓ Marcar visité"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.botonAccionUbicar}
                  onPress={() => {
                    iniciarAjuste(clienteSeleccionado);
                    setClienteSeleccionado(null);
                  }}
                >
                  <Text style={styles.botonAccionUbicarTexto}>📍 Mover</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

      {/* Tarjeta Flotante con el Recorrido Real del Vendedor */}
      {!clienteSeleccionado && !clienteAjustando && (
        <View style={styles.tarjetaResumenFlotante}>
          <View style={styles.filaResumen}>
            <View style={{ flex: 1 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <View
                  style={[
                    styles.indicadorPunto,
                    grabandoRuta
                      ? styles.indicadorGrabando
                      : styles.indicadorPausado,
                  ]}
                />
                <Text style={styles.estadoTexto}>
                  {grabandoRuta ? "Ruta en vivo activa" : "Tracking pausado"}
                </Text>
              </View>
              <Text style={styles.tituloKm}>
                {kmRecorridosReales.toFixed(2)} km recorridos hoy
              </Text>
              <Text style={styles.subtituloKm}>
                {conteoPrioridades.urgentes} urgentes 🔴 ·{" "}
                {conteoPrioridades.media} en alerta 🟡
              </Text>
            </View>

            <View style={styles.accionesTracking}>
              <TouchableOpacity
                style={[
                  styles.botonTracking,
                  grabandoRuta ? styles.botonPausar : styles.botonReanudar,
                ]}
                onPress={grabandoRuta ? pausarTracking : reanudarTracking}
              >
                <Text
                  style={[
                    styles.botonTrackingTexto,
                    grabandoRuta
                      ? styles.botonPausarTexto
                      : styles.botonReanudarTexto,
                  ]}
                >
                  {grabandoRuta ? "⏸️ Pausar" : "▶️ Grabar"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.botonReiniciar}
                onPress={reiniciarTrayectoriaHoy}
              >
                <Text style={styles.botonReiniciarTexto}>🔄</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Lista inferior para ubicar clientes pendientes */}
      {!clienteAjustando &&
        !clienteSeleccionado &&
        clientesSinUbicar.length > 0 && (
          <View style={styles.listaPorCorregir}>
            <Text style={styles.tituloLista}>
              Sin ubicar todavía ({clientesSinUbicar.length})
            </Text>
            {clientesSinUbicar.slice(0, 3).map((cliente) => (
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
      {!clienteAjustando &&
        !clienteSeleccionado &&
        clientesAproximados.length > 0 && (
          <View style={styles.listaPorCorregir}>
            <Text style={styles.tituloLista}>
              🟠 Ubicación aproximada, revisar ({clientesAproximados.length})
            </Text>
            {clientesAproximados.slice(0, 3).map((cliente) => (
              <TouchableOpacity
                key={cliente.id}
                style={styles.filaPorCorregir}
                onPress={() => iniciarAjuste(cliente)}
              >
                <Text style={styles.nombrePorCorregir}>{cliente.nombre}</Text>
                <Text style={styles.tocarTexto}>Ajustar →</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  contenedorFiltros: {
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tituloFiltro: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  scrollFiltros: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  chipFiltro: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chipFiltroActivo: {
    backgroundColor: "#1e3a8a",
    borderColor: "#1e3a8a",
  },
  chipFiltroTexto: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4b5563",
  },
  chipFiltroTextoActivo: {
    color: "#fff",
  },
  chipRojo: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
  },
  chipRojoActivo: {
    backgroundColor: "#dc2626",
    borderColor: "#dc2626",
  },
  chipRojoTexto: {
    color: "#991b1b",
  },
  chipAmarillo: {
    backgroundColor: "#fef9c3",
    borderColor: "#fef08a",
  },
  chipAmarilloActivo: {
    backgroundColor: "#ca8a04",
    borderColor: "#ca8a04",
  },
  chipAmarilloTexto: {
    color: "#854d0e",
  },
  chipVerde: {
    backgroundColor: "#dcfce7",
    borderColor: "#bbf7d0",
  },
  chipVerdeActivo: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  chipVerdeTexto: {
    color: "#166534",
  },
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
  tarjetaResumenFlotante: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filaResumen: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  indicadorPunto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  indicadorGrabando: {
    backgroundColor: "#16a34a",
  },
  indicadorPausado: {
    backgroundColor: "#eab308",
  },
  estadoTexto: {
    fontSize: 11,
    color: "#6b7280",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  tituloKm: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1e3a8a",
    marginTop: 2,
  },
  subtituloKm: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  accionesTracking: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  botonTracking: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  botonPausar: {
    backgroundColor: "#fef3c7",
    borderColor: "#fde68a",
  },
  botonPausarTexto: {
    color: "#92400e",
    fontWeight: "700",
    fontSize: 12,
  },
  botonReanudar: {
    backgroundColor: "#dcfce7",
    borderColor: "#bbf7d0",
  },
  botonReanudarTexto: {
    color: "#15803d",
    fontWeight: "700",
    fontSize: 12,
  },
  botonTrackingTexto: {
    fontSize: 12,
    fontWeight: "700",
  },
  botonReiniciar: {
    backgroundColor: "#f3f4f6",
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  botonReiniciarTexto: {
    fontSize: 14,
  },
  listaPorCorregir: {
    backgroundColor: "#fff",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    maxHeight: 160,
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
  tarjetaClienteFlotante: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 20,
    zIndex: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  encabezadoClienteFlotante: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  nombreClienteFlotante: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111827",
    maxWidth: 200,
  },
  badgePrioridadFlotante: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgePrioridadFlotanteTexto: {
    fontSize: 10,
    fontWeight: "700",
  },
  direccionClienteFlotante: {
    fontSize: 13,
    color: "#4b5563",
    marginTop: 2,
  },
  etiquetaClienteFlotante: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
    fontWeight: "500",
  },
  botonCerrarCard: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  botonCerrarTexto: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "bold",
  },
  accionesClienteFlotante: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  botonAccionNav: {
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  botonAccionNavTexto: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  botonAccionVisitar: {
    flex: 1,
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  botonAccionYaVisitado: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  botonAccionVisitarTexto: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
  },
  botonAccionYaVisitadoTexto: {
    color: "#15803d",
  },
  botonAccionUbicar: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  botonAccionUbicarTexto: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 12,
  },
  puntoVendedorHalo: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(37, 99, 235, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  puntoVendedorCentro: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    borderWidth: 3,
    borderColor: "#fff",
  },
});
