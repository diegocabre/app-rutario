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
import { Alert, Linking } from "react-native";

import { generarCSVClientes, parsearCSV } from "@/services/csv";
import {
  geocodificarDireccion,
  ResultadoGeocodificacion,
} from "@/services/geocoding";
import {
  cuposDisponibles,
  LIMITE_DEMO,
  URL_PRODUCTO,
} from "@/services/demo";
import { obtenerFechaHoy } from "@/services/prioridad";
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
const STORAGE_KEY_VINCULADA = "vinculada"; // lo pondrá en "true" vinculacion-qr

function avisarLimiteDemo(): void {
  Alert.alert(
    `Versión demo: máximo ${LIMITE_DEMO} clientes`,
    "Para agregar más clientes, vincula tu app con el QR de tu empresa. Conoce los planes de Ruta DyS en rutario.solucionesdys.cl.",
    [
      { text: "Cerrar", style: "cancel" },
      { text: "Ver planes", onPress: () => Linking.openURL(URL_PRODUCTO) },
    ],
  );
}

type VisitasPorFecha = Record<string, RegistroVisita[]>;

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

async function direccionDesdeCoords(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  try {
    const [d] = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (!d) return null;
    const calle = [d.street ?? d.name, d.streetNumber].filter(Boolean).join(" ");
    const texto = [calle, d.city ?? d.subregion].filter(Boolean).join(", ");
    return texto || d.formattedAddress || null;
  } catch (e) {
    console.warn("No se pudo obtener la dirección del punto", e);
    return null;
  }
}

interface ClientesContextType {
  clientes: Cliente[];
  importando: boolean;
  vinculada: boolean;
  progresoImport: { actual: number; total: number };
  agregando: boolean;
  agregarCliente: (
    nombre: string,
    rut: string,
    direccion: string,
  ) => Promise<boolean>;
  importarCSV: () => Promise<void>;
  exportarClientes: () => Promise<void>;
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
  ) => Promise<string | null>;
  ubicarEnPosicionActual: (cliente: Cliente) => Promise<void>;
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
  // Lista vigente para las funciones async: el `clientes` de su closure queda viejo mientras geocodifican
  const clientesRef = useRef<Cliente[]>([]);
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState({ actual: 0, total: 0 });
  const [agregando, setAgregando] = useState(false);
  const [vinculada, setVinculada] = useState(false);

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
    AsyncStorage.getItem(STORAGE_KEY_VINCULADA)
      .then((valor) => setVinculada(valor === "true"))
      .catch((e) => console.error("Error leyendo vinculación", e));
  }, []);

  const cargarClientes = async (): Promise<void> => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        clientesRef.current = JSON.parse(data) as Cliente[];
        setClientes(clientesRef.current);
      }
    } catch (e) {
      console.error("Error cargando clientes", e);
    }
  };

  // Recibe un updater sobre la lista vigente para no pisar cambios hechos durante un await
  const guardarClientes = async (
    actualizar: (lista: Cliente[]) => Cliente[],
  ): Promise<void> => {
    const nuevaLista = actualizar(clientesRef.current);
    clientesRef.current = nuevaLista;
    setClientes(nuevaLista);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nuevaLista));
    } catch (e) {
      console.error("Error guardando clientes", e);
    }
  };

  const guardarResultadoGeo = (
    clienteId: string,
    resultado: ResultadoGeocodificacion,
  ): Promise<void> => {
    const tieneCoords =
      resultado.status === "ok" || resultado.status === "aproximado";
    return guardarClientes((lista) =>
      lista.map((c) =>
        c.id === clienteId
          ? {
              ...c,
              lat: tieneCoords ? resultado.coords.lat : undefined,
              lng: tieneCoords ? resultado.coords.lng : undefined,
              geoStatus: resultado.status,
            }
          : c,
      ),
    );
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
  ): Promise<boolean> => {
    if (cuposDisponibles(clientesRef.current.length, vinculada) === 0) {
      avisarLimiteDemo();
      return false;
    }

    if (!nombre.trim() || !direccion.trim() || !rut.trim()) {
      Alert.alert("Faltan datos", "Nombre, RUT y dirección son obligatorios");
      return false;
    }

    if (!formatoRutValido(rut)) {
      Alert.alert(
        "RUT inválido",
        "Revisa el RUT ingresado, el formato no es válido",
      );
      return false;
    }

    const rutLimpio = limpiarRut(rut);
    const yaExiste = clientesRef.current.find(
      (c) => limpiarRut(c.rut) === rutLimpio,
    );

    if (yaExiste) {
      Alert.alert(
        "Cliente duplicado",
        `Ese RUT ya está registrado para "${yaExiste.nombre}"`,
      );
      return false;
    }

    setAgregando(true);

    const nuevoCliente: Cliente = {
      id: Date.now().toString(),
      nombre: nombre.trim(),
      rut: formatearRut(rut),
      direccion: direccion.trim(),
      geoStatus: "pendiente",
    };

    try {
      await guardarClientes((lista) => [...lista, nuevoCliente]);
      const resultado = await geocodificarDireccion(nuevoCliente.direccion);
      await guardarResultadoGeo(nuevoCliente.id, resultado);
    } finally {
      setAgregando(false);
    }
    return true;
  };

  const importarCSV = async (): Promise<void> => {
    if (cuposDisponibles(clientesRef.current.length, vinculada) === 0) {
      avisarLimiteDemo();
      return;
    }

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

      const buscarPorDireccion = await new Promise<boolean>((resolve) =>
        Alert.alert(
          "¿Cómo ubicar estos clientes?",
          "Si las direcciones del archivo no son confiables, impórtalos sin ubicar y regístralos en terreno con «Estoy aquí» o desde el Mapa.",
          [
            { text: "Los ubico yo", onPress: () => resolve(false) },
            { text: "Buscar por dirección", onPress: () => resolve(true) },
          ],
          { cancelable: false },
        ),
      );

      setImportando(true);
      setProgresoImport({ actual: 0, total: filas.length });

      // RUT + nombre: plantas distintas de una misma empresa comparten RUT
      const clave = (rut: string, nombre: string) =>
        `${limpiarRut(rut)}|${nombre.trim().toUpperCase()}`;
      const clavesExistentes = new Set(
        clientesRef.current.map((c) => clave(c.rut, c.nombre)),
      );
      let duplicadosOmitidos = 0;

      const nuevosClientes: Cliente[] = [];

      for (const fila of filas) {
        const claveFila = clave(fila.rut, fila.nombre);
        if (clavesExistentes.has(claveFila)) {
          duplicadosOmitidos++;
          continue;
        }
        clavesExistentes.add(claveFila);

        nuevosClientes.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          nombre: fila.nombre,
          rut: formatoRutValido(fila.rut)
            ? formatearRut(fila.rut)
            : fila.rut.trim(),
          direccion: fila.direccion,
          geoStatus: buscarPorDireccion ? "pendiente" : "manual",
          ultimaVisita: fila.ultimaVisita,
        });
      }

      if (nuevosClientes.length === 0) {
        setImportando(false);
        Alert.alert(
          "Nada que importar",
          `Los ${duplicadosOmitidos} clientes del archivo ya existían`,
        );
        return;
      }

      // En demo solo entran los cupos que quedan; el resto se informa en el resumen
      const cupos = cuposDisponibles(clientesRef.current.length, vinculada);
      const fueraPorLimite = Math.max(0, nuevosClientes.length - cupos);
      if (fueraPorLimite > 0) nuevosClientes.length = cupos;
      const notaLimite =
        fueraPorLimite > 0
          ? `\n🔒 ${fueraPorLimite} quedaron fuera: la versión demo permite ${LIMITE_DEMO} clientes. Vincula tu app para importarlos todos.`
          : "";

      await guardarClientes((lista) => [...lista, ...nuevosClientes]);

      if (!buscarPorDireccion) {
        setImportando(false);
        Alert.alert(
          "Importación completa",
          `✅ ${nuevosClientes.length} clientes importados sin ubicar.\n` +
            "Ubícalos con «Estoy aquí» cuando los visites, o desde el Mapa." +
            (duplicadosOmitidos > 0
              ? `\nℹ️ ${duplicadosOmitidos} duplicados omitidos.`
              : "") +
            notaLimite,
        );
        return;
      }

      let sinUbicar = 0;
      for (let i = 0; i < nuevosClientes.length; i++) {
        const cliente = nuevosClientes[i];
        const resultadoGeo = await geocodificarDireccion(cliente.direccion);
        if (
          resultadoGeo.status !== "ok" &&
          resultadoGeo.status !== "aproximado"
        ) {
          sinUbicar++;
        }
        await guardarResultadoGeo(cliente.id, resultadoGeo);
        setProgresoImport({ actual: i + 1, total: nuevosClientes.length });

        if (i < nuevosClientes.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      const ubicadosOk = nuevosClientes.length - sinUbicar;

      setImportando(false);
      Alert.alert(
        "Importación completa",
        `✅ ${ubicadosOk} clientes ubicados.\n` +
          (sinUbicar > 0
            ? `⚠️ ${sinUbicar} requieren ajuste manual en el Mapa.\n`
            : "") +
          (duplicadosOmitidos > 0
            ? `ℹ️ ${duplicadosOmitidos} duplicados omitidos.`
            : "") +
          notaLimite,
      );
    } catch (e: any) {
      setImportando(false);
      Alert.alert("Error", e.message ?? "Error al importar el archivo");
      console.error("Error importando CSV", e);
    }
  };

  // Respaldo con coordenadas por correo (sirve también para cargar los clientes en el panel)
  const exportarClientes = async (): Promise<void> => {
    const lista = clientesRef.current;
    if (lista.length === 0) {
      Alert.alert("Sin clientes", "No hay clientes para exportar.");
      return;
    }
    if (!(await MailComposer.isAvailableAsync())) {
      Alert.alert(
        "Sin app de correo",
        "No se encontró una app de correo configurada en este teléfono.",
      );
      return;
    }
    try {
      const ruta = `${FileSystem.cacheDirectory}clientes_${obtenerFechaHoy()}.csv`;
      await FileSystem.writeAsStringAsync(ruta, generarCSVClientes(lista), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const ubicados = lista.filter((c) => c.lat != null && c.lng != null);
      await MailComposer.composeAsync({
        subject: `Respaldo de clientes — ${new Date().toLocaleDateString("es-CL")}`,
        body: `${lista.length} clientes (${ubicados.length} con ubicación GPS).`,
        attachments: [ruta],
      });
    } catch (e) {
      console.error("Error exportando clientes", e);
      Alert.alert("Error", "No se pudieron exportar los clientes.");
    }
  };

  const actualizarUbicacionManual = async (
    clienteId: string,
    lat: number,
    lng: number,
  ): Promise<string | null> => {
    await guardarClientes((lista) =>
      lista.map((c) =>
        c.id === clienteId ? { ...c, lat, lng, geoStatus: "ok" as const } : c,
      ),
    );

    // La dirección del archivo no es confiable: se reemplaza por la del punto ubicado
    const direccion = await direccionDesdeCoords(lat, lng);
    if (direccion) {
      await guardarClientes((lista) =>
        lista.map((c) => (c.id === clienteId ? { ...c, direccion } : c)),
      );
    }
    return direccion;
  };

  const ubicarEnPosicionActual = async (cliente: Cliente): Promise<void> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Sin permiso", "Activa el permiso de ubicación para usar «Estoy aquí».");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const direccion = await actualizarUbicacionManual(
        cliente.id,
        pos.coords.latitude,
        pos.coords.longitude,
      );
      const precision = pos.coords.accuracy
        ? ` (±${Math.round(pos.coords.accuracy)} m)`
        : "";
      Alert.alert(
        "Ubicación guardada",
        `${cliente.nombre}${precision}` + (direccion ? `\n${direccion}` : ""),
      );
    } catch (e) {
      console.error("Error obteniendo la posición actual", e);
      Alert.alert("Sin GPS", "No se pudo obtener tu ubicación, inténtalo de nuevo.");
    }
  };

  const reintentarGeocodificacion = async (
    clienteId: string,
  ): Promise<void> => {
    const cliente = clientesRef.current.find((c) => c.id === clienteId);
    if (!cliente) return;

    await guardarClientes((lista) =>
      lista.map((c) =>
        c.id === clienteId ? { ...c, geoStatus: "pendiente" as const } : c,
      ),
    );

    const resultado = await geocodificarDireccion(cliente.direccion);
    await guardarResultadoGeo(clienteId, resultado);
  };

  const guardarCorreccionDireccion = async (
    clienteId: string,
    nuevaDireccion: string,
  ): Promise<void> => {
    if (!nuevaDireccion.trim()) return;

    // Si ya tiene pin (p. ej. tomado con GPS en terreno), no moverlo sin preguntar
    const cliente = clientesRef.current.find((c) => c.id === clienteId);
    const yaUbicado =
      (cliente?.geoStatus === "ok" || cliente?.geoStatus === "aproximado") &&
      cliente.lat != null &&
      cliente.lng != null;
    const moverPin =
      !yaUbicado ||
      (await new Promise<boolean>((resolve) =>
        Alert.alert(
          "¿Mover el pin?",
          "Este cliente ya está ubicado en el mapa. ¿Buscar la nueva dirección y mover el pin, o solo cambiar el texto?",
          [
            { text: "Solo el texto", onPress: () => resolve(false) },
            { text: "Mover el pin", onPress: () => resolve(true) },
          ],
          { cancelable: false },
        ),
      ));

    if (!moverPin) {
      await guardarClientes((lista) =>
        lista.map((c) =>
          c.id === clienteId ? { ...c, direccion: nuevaDireccion.trim() } : c,
        ),
      );
      return;
    }

    await guardarClientes((lista) =>
      lista.map((c) =>
        c.id === clienteId
          ? {
              ...c,
              direccion: nuevaDireccion.trim(),
              geoStatus: "pendiente" as const,
            }
          : c,
      ),
    );

    try {
      const resultado = await geocodificarDireccion(nuevaDireccion.trim());
      await guardarResultadoGeo(clienteId, resultado);
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

    guardarClientes((lista) =>
      lista.map((c) =>
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
          onPress: () =>
            guardarClientes((lista) => lista.filter((c) => c.id !== id)),
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
          guardarClientes(() => []);
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
    if (visitasDeHoy.some((v) => v.clienteId === cliente.id)) return;

    const nuevaVisita: RegistroVisita = {
      clienteId: cliente.id,
      nombreCliente: cliente.nombre,
      horaVisita: new Date().toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      ultimaVisitaAnterior: clientesRef.current.find((c) => c.id === cliente.id)
        ?.ultimaVisita,
    };

    todasLasVisitas[hoy] = [...visitasDeHoy, nuevaVisita];
    await AsyncStorage.setItem(
      STORAGE_KEY_VISITAS,
      JSON.stringify(todasLasVisitas),
    );

    // Actualizar fecha de última visita del cliente a hoy
    const fechaActual = new Date().toISOString();
    await guardarClientes((lista) =>
      lista.map((c) =>
        c.id === cliente.id ? { ...c, ultimaVisita: fechaActual } : c,
      ),
    );

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
    const registro = (todasLasVisitas[hoy] ?? []).find(
      (v) => v.clienteId === clienteId,
    );
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

    // La fecha previa guardada al marcar incluye la del CSV; registros antiguos no la tienen
    const ultimaFecha = registro?.ultimaVisitaAnterior ?? visitasPrevias[0];
    await guardarClientes((lista) =>
      lista.map((c) =>
        c.id === clienteId ? { ...c, ultimaVisita: ultimaFecha } : c,
      ),
    );

    setVisitadosHoy(todasLasVisitas[hoy]);
    await calcularRuta();
  };

  const kmTotalesRuta = ruta.reduce((acc, c) => acc + c.distanciaKm, 0);

  return (
    <ClientesContext.Provider
      value={{
        clientes,
        importando,
        vinculada,
        progresoImport,
        agregando,
        agregarCliente,
        importarCSV,
        exportarClientes,
        eliminarCliente,
        reintentarGeocodificacion,
        guardarCorreccionDireccion,
        guardarCorreccionRut,
        actualizarUbicacionManual,
        ubicarEnPosicionActual,
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
