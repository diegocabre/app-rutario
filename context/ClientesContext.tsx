import { generarArchivoAdjunto, generarCuerpoCorreo } from "@/services/reporte";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import * as MailComposer from "expo-mail-composer";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert } from "react-native";

import { parsearCSV } from "@/services/csv";
import { geocodificarDireccion } from "@/services/geocoding";
import { obtenerRutaVialEntrePuntos } from "@/services/routing";
import { formatearRut, formatoRutValido, limpiarRut } from "@/services/rut";
import {
  Cliente,
  ClienteConDistancia,
  PuntoGPS,
  RegistroVisita,
} from "@/types/cliente";

const STORAGE_KEY = "clientes";
const STORAGE_KEY_VISITAS = "visitas";
const STORAGE_KEY_TRACKING_PREFIJO = "tracking_trayectoria_";
const STORAGE_KEY_TRACKING_KM_PREFIJO = "tracking_km_";

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

interface ClientesContextType {
  clientes: Cliente[];
  importando: boolean;
  progresoImport: { actual: number; total: number };
  agregando: boolean;
  agregarCliente: (
    nombre: string,
    rut: string,
    direccion: string,
  ) => Promise<void>;
  importarCSV: () => Promise<void>;
  eliminarCliente: (id: string) => void;
  reintentarGeocodificacion: (clienteId: string) => Promise<void>;
  guardarCorreccionDireccion: (
    clienteId: string,
    nuevaDireccion: string,
  ) => Promise<void>;
  guardarCorreccionRut: (clienteId: string, nuevoRut: string) => boolean;
  actualizarUbicacionManual: (
    clienteId: string,
    lat: number,
    lng: number,
  ) => Promise<void>;
  borrarTodosLosClientes: () => void;
  enviarReporteDelDia: (correoDestino?: string) => Promise<void>;

  // Estado y acciones de la Ruta Diaria
  ruta: ClienteConDistancia[];
  visitadosHoy: RegistroVisita[];
  posicionVendedor: { latitude: number; longitude: number } | null;
  kmTotalesRuta: number;
  cargandoRuta: boolean;
  errorRuta: string | null;
  calcularRuta: () => Promise<void>;
  marcarVisitado: (cliente: Cliente | ClienteConDistancia) => Promise<void>;
  deshacerVisita: (clienteId: string) => Promise<void>;

  // Tracking GPS en Vivo del Recorrido Real del Vendedor
  trayectoriaReal: PuntoGPS[];
  kmRecorridosReales: number;
  grabandoRuta: boolean;
  pausarTracking: () => void;
  reanudarTracking: () => void;
  reiniciarTrayectoriaHoy: () => void;

  // Modo de visualización en el mapa
  modoMapa: "recorrido" | "todos";
  setModoMapa: (modo: "recorrido" | "todos") => void;
}

const ClientesContext = createContext<ClientesContextType | null>(null);

export function ClientesProvider({ children }: { children: React.ReactNode }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState({ actual: 0, total: 0 });
  const [agregando, setAgregando] = useState(false);

  // Estados de Ruta Planificada
  const [ruta, setRuta] = useState<ClienteConDistancia[]>([]);
  const [visitadosHoy, setVisitadosHoy] = useState<RegistroVisita[]>([]);
  const [posicionVendedor, setPosicionVendedor] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [errorRuta, setErrorRuta] = useState<string | null>(null);
  const [modoMapa, setModoMapa] = useState<"recorrido" | "todos">("recorrido");

  // Estados de Tracking GPS Real (Migas de Pan)
  const [trayectoriaReal, setTrayectoriaReal] = useState<PuntoGPS[]>([]);
  const trayectoriaRealRef = useRef<PuntoGPS[]>([]);
  const [kmRecorridosReales, setKmRecorridosReales] = useState(0);
  const kmRecorridosRealesRef = useRef(0);
  const [grabandoRuta, setGrabandoRuta] = useState(true);
  const grabandoRutaRef = useRef(grabandoRuta);
  const procesandoSaltoRef = useRef(false);

  useEffect(() => {
    grabandoRutaRef.current = grabandoRuta;
  }, [grabandoRuta]);

  useEffect(() => {
    cargarClientes();
    cargarTrayectoriaHoy();
  }, []);

  const cargarClientes = async (): Promise<void> => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) setClientes(JSON.parse(data) as Cliente[]);
    } catch (e) {
      console.error("Error cargando clientes", e);
    }
  };

  const guardarClientes = async (nuevaLista: Cliente[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevaLista));
      setClientes(nuevaLista);
    } catch (e) {
      console.error("Error guardando clientes", e);
    }
  };

  // Cargar trayectoria guardada de hoy
  const cargarTrayectoriaHoy = async (): Promise<void> => {
    try {
      const fecha = obtenerFechaHoy();
      const keyTrayectoria = `${STORAGE_KEY_TRACKING_PREFIJO}${fecha}`;
      const data = await AsyncStorage.getItem(keyTrayectoria);
      if (data) {
        const puntos: PuntoGPS[] = JSON.parse(data);
        setTrayectoriaReal(puntos);
        trayectoriaRealRef.current = puntos;

        const keyKm = `${STORAGE_KEY_TRACKING_KM_PREFIJO}${fecha}`;
        const dataKm = await AsyncStorage.getItem(keyKm);
        if (dataKm) {
          const km = parseFloat(dataKm) || 0;
          setKmRecorridosReales(km);
          kmRecorridosRealesRef.current = km;
        } else {
          let km = 0;
          for (let i = 1; i < puntos.length; i++) {
            km += calcularDistanciaKm(
              puntos[i - 1].latitude,
              puntos[i - 1].longitude,
              puntos[i].latitude,
              puntos[i].longitude,
            );
          }
          setKmRecorridosReales(km);
          kmRecorridosRealesRef.current = km;
        }
      }
    } catch (e) {
      console.error("Error cargando trayectoria de hoy", e);
    }
  };

  const guardarTrayectoria = async (
    puntos: PuntoGPS[],
    km: number,
  ): Promise<void> => {
    try {
      const fecha = obtenerFechaHoy();
      const keyTrayectoria = `${STORAGE_KEY_TRACKING_PREFIJO}${fecha}`;
      const keyKm = `${STORAGE_KEY_TRACKING_KM_PREFIJO}${fecha}`;
      await AsyncStorage.multiSet([
        [keyTrayectoria, JSON.stringify(puntos)],
        [keyKm, km.toString()],
      ]);
    } catch (e) {
      console.error("Error guardando trayectoria", e);
    }
  };

  // Suscripción al GPS en vivo para trazar el recorrido real
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let montado = true;

    const iniciarWatcherGPS = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        // Posición actual inicial
        const posActual = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (montado) {
          setPosicionVendedor({
            latitude: posActual.coords.latitude,
            longitude: posActual.coords.longitude,
          });
        }

        // Suscripción de movimiento continuo
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2500, // cada 2.5 seg
            distanceInterval: 6, // cada 6 metros de cambio
          },
          async (loc) => {
            if (!montado) return;

            const nuevaCoords = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            setPosicionVendedor(nuevaCoords);

            // Solo grabar si el tracking está activo
            if (!grabandoRutaRef.current) return;

            // Descartar lecturas con mala precisión (más de 65m de error, calibrado para auto)
            if (loc.coords.accuracy && loc.coords.accuracy > 65) return;

            const nuevoPunto: PuntoGPS = {
              latitude: nuevaCoords.latitude,
              longitude: nuevaCoords.longitude,
              timestamp: loc.timestamp || Date.now(),
            };

            const listaActual = trayectoriaRealRef.current;
            if (listaActual.length === 0) {
              const inicial = [nuevoPunto];
              trayectoriaRealRef.current = inicial;
              setTrayectoriaReal(inicial);
              guardarTrayectoria(inicial, 0);
              return;
            }

            const ultimo = listaActual[listaActual.length - 1];
            const distDirectaKm = calcularDistanciaKm(
              ultimo.latitude,
              ultimo.longitude,
              nuevoPunto.latitude,
              nuevoPunto.longitude,
            );

            // Filtro antideriva: si se movió menos de 10 metros, ignorar (vendedor detenido)
            if (distDirectaKm < 0.01) return;

            // Desplazamiento normal por la vía (entre 10m y 70m)
            if (distDirectaKm < 0.07) {
              const actualizada = [...listaActual, nuevoPunto];
              const nuevoKm = kmRecorridosRealesRef.current + distDirectaKm;
              trayectoriaRealRef.current = actualizada;
              kmRecorridosRealesRef.current = nuevoKm;
              setTrayectoriaReal(actualizada);
              setKmRecorridosReales(nuevoKm);
              guardarTrayectoria(actualizada, nuevoKm);
              return;
            }

            // Salto mayor a 70m (pantalla bloqueada, Waze, curva pronunciada o túnel):
            // Consultamos OSRM para seguir las calles exactas y sumar los km viales reales
            if (procesandoSaltoRef.current) return;
            procesandoSaltoRef.current = true;

            try {
              const rutaVial = await obtenerRutaVialEntrePuntos(
                ultimo,
                nuevoPunto,
              );
              const puntosParaAgregar =
                rutaVial.puntos.length > 1
                  ? rutaVial.puntos.slice(1)
                  : [nuevoPunto];

              const base = trayectoriaRealRef.current;
              const actualizada = [...base, ...puntosParaAgregar];
              const nuevoKm =
                kmRecorridosRealesRef.current + rutaVial.distanciaKm;
              trayectoriaRealRef.current = actualizada;
              kmRecorridosRealesRef.current = nuevoKm;
              setTrayectoriaReal(actualizada);
              setKmRecorridosReales(nuevoKm);
              guardarTrayectoria(actualizada, nuevoKm);
            } catch {
              const base = trayectoriaRealRef.current;
              const actualizada = [...base, nuevoPunto];
              const nuevoKm = kmRecorridosRealesRef.current + distDirectaKm;
              trayectoriaRealRef.current = actualizada;
              kmRecorridosRealesRef.current = nuevoKm;
              setTrayectoriaReal(actualizada);
              setKmRecorridosReales(nuevoKm);
              guardarTrayectoria(actualizada, nuevoKm);
            } finally {
              procesandoSaltoRef.current = false;
            }
          },
        );
      } catch (err) {
        console.warn("No se pudo iniciar el tracking GPS en vivo:", err);
      }
    };

    iniciarWatcherGPS();

    return () => {
      montado = false;
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  const pausarTracking = () => setGrabandoRuta(false);
  const reanudarTracking = () => setGrabandoRuta(true);

  const reiniciarTrayectoriaHoy = () => {
    Alert.alert(
      "Reiniciar recorrido de hoy",
      "¿Deseas borrar la línea de recorrido y reiniciar el contador de km a cero?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reiniciar",
          style: "destructive",
          onPress: async () => {
            setTrayectoriaReal([]);
            trayectoriaRealRef.current = [];
            setKmRecorridosReales(0);
            kmRecorridosRealesRef.current = 0;
            const fecha = obtenerFechaHoy();
            await AsyncStorage.multiRemove([
              `${STORAGE_KEY_TRACKING_PREFIJO}${fecha}`,
              `${STORAGE_KEY_TRACKING_KM_PREFIJO}${fecha}`,
            ]);
          },
        },
      ],
    );
  };

  const agregarCliente = async (
    nombre: string,
    rut: string,
    direccion: string,
  ): Promise<void> => {
    if (!nombre.trim() || !direccion.trim() || !rut.trim()) {
      Alert.alert("Faltan datos", "Nombre, RUT y dirección son obligatorios");
      return;
    }

    if (!formatoRutValido(rut)) {
      Alert.alert(
        "RUT inválido",
        "Revisa el RUT ingresado, el formato no es válido",
      );
      return;
    }

    const rutLimpio = limpiarRut(rut);
    const yaExiste = clientes.find((c) => limpiarRut(c.rut) === rutLimpio);

    if (yaExiste) {
      Alert.alert(
        "Cliente duplicado",
        `Ese RUT ya está registrado para "${yaExiste.nombre}"`,
      );
      return;
    }

    setAgregando(true);

    const nuevoCliente: Cliente = {
      id: Date.now().toString(),
      nombre: nombre.trim(),
      rut: formatearRut(rut),
      direccion: direccion.trim(),
      geoStatus: "pendiente",
    };

    const listaConNuevo = [...clientes, nuevoCliente];
    await guardarClientes(listaConNuevo);

    const resultado = await geocodificarDireccion(nuevoCliente.direccion);
    const tieneCoords =
      resultado.status === "ok" || resultado.status === "aproximado";

    const listaActualizada = listaConNuevo.map((c) =>
      c.id === nuevoCliente.id
        ? {
            ...c,
            lat: tieneCoords ? resultado.coords.lat : undefined,
            lng: tieneCoords ? resultado.coords.lng : undefined,
            geoStatus: resultado.status,
          }
        : c,
    );

    await guardarClientes(listaActualizada);
    setAgregando(false);
  };

  const importarCSV = async (): Promise<void> => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "*/*"],
      });

      if (resultado.canceled) return;

      const uri = resultado.assets[0].uri;
      const contenido = await FileSystem.readAsStringAsync(uri);
      const filas = parsearCSV(contenido);

      if (filas.length === 0) {
        Alert.alert("Archivo vacío", "El archivo no tiene clientes válidos");
        return;
      }

      setImportando(true);
      setProgresoImport({ actual: 0, total: filas.length });

      const rutsExistentes = new Set(clientes.map((c) => limpiarRut(c.rut)));
      const rutsEnEsteArchivo = new Set<string>();
      let duplicadosOmitidos = 0;
      let invalidosOmitidos = 0;

      const nuevosClientes: Cliente[] = [];

      for (const fila of filas) {
        if (!fila.rut || !fila.rut.trim()) {
          invalidosOmitidos++;
          continue;
        }

        const rutLimpio = limpiarRut(fila.rut);

        if (rutsExistentes.has(rutLimpio) || rutsEnEsteArchivo.has(rutLimpio)) {
          duplicadosOmitidos++;
          continue;
        }

        rutsEnEsteArchivo.add(rutLimpio);

        nuevosClientes.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          nombre: fila.nombre,
          rut: formatoRutValido(fila.rut)
            ? formatearRut(fila.rut)
            : fila.rut.trim(),
          direccion: fila.direccion,
          geoStatus: "pendiente",
          ultimaVisita: fila.ultimaVisita,
        });
      }

      if (nuevosClientes.length === 0) {
        setImportando(false);
        Alert.alert(
          "Nada que importar",
          `Todos los registros ya existían o tenían RUT inválido (${duplicadosOmitidos} duplicados, ${invalidosOmitidos} inválidos)`,
        );
        return;
      }

      let listaActual = [...clientes, ...nuevosClientes];
      await guardarClientes(listaActual);

      for (let i = 0; i < nuevosClientes.length; i++) {
        const cliente = nuevosClientes[i];
        const resultadoGeo = await geocodificarDireccion(cliente.direccion);
        const tieneCoords =
          resultadoGeo.status === "ok" || resultadoGeo.status === "aproximado";

        listaActual = listaActual.map((c) =>
          c.id === cliente.id
            ? {
                ...c,
                lat: tieneCoords ? resultadoGeo.coords.lat : undefined,
                lng: tieneCoords ? resultadoGeo.coords.lng : undefined,
                geoStatus: resultadoGeo.status,
              }
            : c,
        );
        await guardarClientes(listaActual);
        setProgresoImport({ actual: i + 1, total: nuevosClientes.length });

        if (i < nuevosClientes.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      const conError = listaActual.filter(
        (c) =>
          c.geoStatus === "error" ||
          c.geoStatus === "sin_conexion" ||
          c.geoStatus === "no_encontrado",
      );
      const ubicadosOk = nuevosClientes.length - conError.length;

      setImportando(false);
      Alert.alert(
        "Importación completa",
        `✅ ${ubicadosOk} clientes ubicados.\n` +
          (conError.length > 0
            ? `⚠️ ${conError.length} requieren ajuste manual en el Mapa.\n`
            : "") +
          (duplicadosOmitidos > 0
            ? `ℹ️ ${duplicadosOmitidos} duplicados omitidos.`
            : ""),
      );
    } catch (e: any) {
      setImportando(false);
      Alert.alert("Error", e.message ?? "Error al importar el archivo");
      console.error("Error importando CSV", e);
    }
  };

  const actualizarUbicacionManual = async (
    clienteId: string,
    lat: number,
    lng: number,
  ): Promise<void> => {
    const actualizados = clientes.map((c) =>
      c.id === clienteId ? { ...c, lat, lng, geoStatus: "ok" as const } : c,
    );
    await guardarClientes(actualizados);
  };

  const reintentarGeocodificacion = async (
    clienteId: string,
  ): Promise<void> => {
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return;

    const listaPendiente = clientes.map((c) =>
      c.id === clienteId ? { ...c, geoStatus: "pendiente" as const } : c,
    );
    await guardarClientes(listaPendiente);

    const resultado = await geocodificarDireccion(cliente.direccion);
    const tieneCoords =
      resultado.status === "ok" || resultado.status === "aproximado";

    const listaFinal = listaPendiente.map((c) =>
      c.id === clienteId
        ? {
            ...c,
            lat: tieneCoords ? resultado.coords.lat : undefined,
            lng: tieneCoords ? resultado.coords.lng : undefined,
            geoStatus: resultado.status,
          }
        : c,
    );
    await guardarClientes(listaFinal);
  };

  const guardarCorreccionDireccion = async (
    clienteId: string,
    nuevaDireccion: string,
  ): Promise<void> => {
    if (!nuevaDireccion.trim()) return;

    const listaPendiente = clientes.map((c) =>
      c.id === clienteId
        ? {
            ...c,
            direccion: nuevaDireccion.trim(),
            geoStatus: "pendiente" as const,
          }
        : c,
    );
    await guardarClientes(listaPendiente);

    try {
      const clienteActualizado = listaPendiente.find(
        (c) => c.id === clienteId,
      )!;
      const resultado = await geocodificarDireccion(
        clienteActualizado.direccion,
      );
      const tieneCoords =
        resultado.status === "ok" || resultado.status === "aproximado";

      const listaFinal = listaPendiente.map((c) =>
        c.id === clienteId
          ? {
              ...c,
              lat: tieneCoords ? resultado.coords.lat : undefined,
              lng: tieneCoords ? resultado.coords.lng : undefined,
              geoStatus: resultado.status,
            }
          : c,
      );
      await guardarClientes(listaFinal);
    } catch (e) {
      console.error("Error re-geocodificando dirección corregida", e);
      // La dirección ya quedó guardada arriba; solo falló volver a ubicarla.
      // El cliente queda en geoStatus "pendiente" — se puede reintentar o ubicar manualmente.
    }
  };

  const guardarCorreccionRut = (
    clienteId: string,
    nuevoRut: string,
  ): boolean => {
    if (!nuevoRut.trim() || !formatoRutValido(nuevoRut)) {
      Alert.alert("RUT inválido", "Revisa el formato del RUT ingresado");
      return false;
    }

    const rutLimpio = limpiarRut(nuevoRut);
    const yaExiste = clientes.find(
      (c) => c.id !== clienteId && limpiarRut(c.rut) === rutLimpio,
    );

    if (yaExiste) {
      Alert.alert(
        "RUT duplicado",
        `Ese RUT ya pertenece a "${yaExiste.nombre}"`,
      );
      return false;
    }

    guardarClientes(
      clientes.map((c) =>
        c.id === clienteId ? { ...c, rut: formatearRut(nuevoRut) } : c,
      ),
    );
    return true;
  };

  const eliminarCliente = (id: string): void => {
    const cliente = clientes.find((c) => c.id === id);
    Alert.alert(
      "Eliminar cliente",
      `¿Seguro que quieres eliminar a ${cliente?.nombre ?? "este cliente"}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => guardarClientes(clientes.filter((c) => c.id !== id)),
        },
      ],
    );
  };

  const borrarTodosLosClientes = (): void => {
    if (clientes.length === 0) return;
    Alert.alert("Borrar todos", "¿Deseas eliminar todos los clientes?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar todo",
        style: "destructive",
        onPress: () => {
          guardarClientes([]);
          setRuta([]);
        },
      },
    ]);
  };

  // --- Lógica de la Ruta Planificada ---
  const cargarVisitasHoy = async (): Promise<RegistroVisita[]> => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY_VISITAS);
      const todasLasVisitas: VisitasPorFecha = data ? JSON.parse(data) : {};
      return todasLasVisitas[obtenerFechaHoy()] ?? [];
    } catch {
      return [];
    }
  };

  const calcularRuta = useCallback(async (): Promise<void> => {
    setCargandoRuta(true);
    setErrorRuta(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorRuta(
          "Necesitamos permiso de ubicación para calcular la ruta del día",
        );
        setCargandoRuta(false);
        return;
      }

      const posicion = await Location.getCurrentPositionAsync({});
      const coordsVendedor = {
        latitude: posicion.coords.latitude,
        longitude: posicion.coords.longitude,
      };
      setPosicionVendedor(coordsVendedor);

      const visitas = await cargarVisitasHoy();
      setVisitadosHoy(visitas);

      const idsVisitados = new Set(visitas.map((v) => v.clienteId));

      const clientesUbicados = clientes.filter(
        (c) =>
          (c.geoStatus === "ok" || c.geoStatus === "aproximado") &&
          c.lat &&
          c.lng &&
          !idsVisitados.has(c.id),
      );

      const rutaOrdenada = ordenarPorVecinoMasCercano(
        coordsVendedor.latitude,
        coordsVendedor.longitude,
        clientesUbicados,
      );

      setRuta(rutaOrdenada);
    } catch (e) {
      console.error("Error calculando ruta", e);
      setErrorRuta("No se pudo calcular la ruta");
    } finally {
      setCargandoRuta(false);
    }
  }, [clientes]);

  const marcarVisitado = async (
    cliente: Cliente | ClienteConDistancia,
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

    // Actualizar fecha de última visita del cliente a hoy
    const fechaActual = new Date().toISOString();
    const clientesActualizados = clientes.map((c) =>
      c.id === cliente.id ? { ...c, ultimaVisita: fechaActual } : c,
    );
    await guardarClientes(clientesActualizados);

    setVisitadosHoy(todasLasVisitas[hoy]);
    setRuta((prev) => prev.filter((c) => c.id !== cliente.id));
  };

  const enviarReporteDelDia = async (correoDestino?: string): Promise<void> => {
    const disponible = await MailComposer.isAvailableAsync();

    if (!disponible) {
      Alert.alert(
        "Sin app de correo",
        "No se encontró una app de correo configurada en este teléfono.",
      );
      return;
    }

    const idsVisitadosHoy = new Set(visitadosHoy.map((v) => v.clienteId));
    const pendientesHoy = clientes.filter(
      (c) =>
        (c.geoStatus === "ok" || c.geoStatus === "aproximado") &&
        !idsVisitadosHoy.has(c.id),
    );

    const cuerpo = generarCuerpoCorreo(
      visitadosHoy,
      pendientesHoy,
      kmRecorridosReales,
    );

    let adjuntos: string[] = [];
    try {
      if (visitadosHoy.length > 0) {
        const rutaArchivo = await generarArchivoAdjunto(visitadosHoy);
        adjuntos = [rutaArchivo];
      }
    } catch (e) {
      console.error("No se pudo generar el archivo adjunto", e);
    }

    await MailComposer.composeAsync({
      recipients: correoDestino ? [correoDestino] : [],
      subject: `Reporte de ruta — ${new Date().toLocaleDateString("es-CL")}`,
      body: cuerpo,
      attachments: adjuntos,
    });
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

    // Buscar fecha de visita previa si existía en otros días
    const visitasPrevias = Object.entries(todasLasVisitas)
      .filter(
        ([fecha, list]) =>
          fecha !== hoy && list.some((v) => v.clienteId === clienteId),
      )
      .map(([fecha]) => fecha)
      .sort()
      .reverse();

    const ultimaFecha =
      visitasPrevias.length > 0 ? visitasPrevias[0] : undefined;
    const clientesActualizados = clientes.map((c) =>
      c.id === clienteId ? { ...c, ultimaVisita: ultimaFecha } : c,
    );
    await guardarClientes(clientesActualizados);

    setVisitadosHoy(todasLasVisitas[hoy]);
    await calcularRuta();
  };

  const kmTotalesRuta = ruta.reduce((acc, c) => acc + c.distanciaKm, 0);

  return (
    <ClientesContext.Provider
      value={{
        clientes,
        importando,
        progresoImport,
        agregando,
        agregarCliente,
        importarCSV,
        eliminarCliente,
        reintentarGeocodificacion,
        guardarCorreccionDireccion,
        guardarCorreccionRut,
        actualizarUbicacionManual,
        borrarTodosLosClientes,

        // Ruta Planificada
        ruta,
        visitadosHoy,
        posicionVendedor,
        kmTotalesRuta,
        cargandoRuta,
        errorRuta,
        calcularRuta,
        marcarVisitado,
        deshacerVisita,
        enviarReporteDelDia,

        // Tracking GPS en Vivo (Recorrido Real)
        trayectoriaReal,
        kmRecorridosReales,
        grabandoRuta,
        pausarTracking,
        reanudarTracking,
        reiniciarTrayectoriaHoy,

        // Modo Mapa
        modoMapa,
        setModoMapa,
      }}
    >
      {children}
    </ClientesContext.Provider>
  );
}

export function useClientes() {
  const context = useContext(ClientesContext);
  if (!context) {
    throw new Error("useClientes debe usarse dentro de un ClientesProvider");
  }
  return context;
}
