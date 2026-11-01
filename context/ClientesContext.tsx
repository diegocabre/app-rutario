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
import { Alert, AppState, Linking } from "react-native";

import { agregarACola, clientesDesdeServidor, uuid, type Pendiente } from "@/services/cola";
import { generarCSVClientes, parsearCSV } from "@/services/csv";
import { useNetworkStatus } from "@/hooks/use-network-status";
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
import { supabase } from "@/services/supabase";
import { mensajeErrorVinculo } from "@/services/vinculo";
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
const STORAGE_KEY_VINCULADA = "vinculada";
const STORAGE_KEY_EMPRESA = "empresa";
const STORAGE_KEY_COLA = "cola_sync";
const STORAGE_KEY_ULTIMA_SYNC = "ultima_sync";
// Cada cuánto se sube el avance (km y lo pendiente) mientras hay señal
const INTERVALO_SYNC_MS = 15 * 60 * 1000;

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
  empresa: string | null;
  /** Cambios hechos en terreno que aún no suben a la empresa */
  pendientesSync: number;
  /** Fecha ISO de la última sincronización completa */
  ultimaSync: string | null;
  sincronizar: () => Promise<void>;
  /** Canjea el token del QR; devuelve el mensaje de error o null si quedó vinculada */
  vincularCon: (token: string) => Promise<string | null>;
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
  const [empresa, setEmpresa] = useState<string | null>(null);
  // Refs para las funciones async: sus closures verían valores viejos
  const vinculadaRef = useRef(false);
  const colaRef = useRef<Pendiente[]>([]);
  const sincronizandoRef = useRef(false);
  const [pendientesSync, setPendientesSync] = useState(0);
  const [ultimaSync, setUltimaSync] = useState<string | null>(null);
  const conectado = useNetworkStatus();

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
    AsyncStorage.multiGet([STORAGE_KEY_VINCULADA, STORAGE_KEY_EMPRESA, STORAGE_KEY_COLA, STORAGE_KEY_ULTIMA_SYNC])
      .then(([[, valor], [, nombre], [, cola], [, ultima]]) => {
        colaRef.current = cola ? (JSON.parse(cola) as Pendiente[]) : [];
        setPendientesSync(colaRef.current.length);
        setUltimaSync(ultima);
        vinculadaRef.current = valor === "true";
        setVinculada(valor === "true");
        setEmpresa(nombre);
        if (valor === "true") sincronizar();
      })
      .catch((e) => console.error("Error leyendo vinculación", e));
  }, []);

  // Si el admin desvinculó este teléfono, vuelve a demo y borra los datos de la empresa (son de ella, no del vendedor)
  const desvincularLocal = async (): Promise<void> => {
    await AsyncStorage.multiRemove([STORAGE_KEY_VINCULADA, STORAGE_KEY_EMPRESA, STORAGE_KEY_VISITAS, STORAGE_KEY_COLA, STORAGE_KEY_ULTIMA_SYNC]);
    vinculadaRef.current = false;
    colaRef.current = [];
    setPendientesSync(0);
    setUltimaSync(null);
    guardarClientes(() => []);
    setRuta([]);
    setVinculada(false);
    setEmpresa(null);
    await supabase.auth.signOut();
    Alert.alert("Desvinculada", "Tu empresa desvinculó este teléfono. La app volvió al modo demo.");
  };

  const encolar = async (pendiente: Pendiente): Promise<void> => {
    if (!vinculadaRef.current) return;
    colaRef.current = agregarACola(colaRef.current, pendiente);
    setPendientesSync(colaRef.current.length);
    await AsyncStorage.setItem(STORAGE_KEY_COLA, JSON.stringify(colaRef.current));
  };

  // Sube lo pendiente y el km de hoy, y baja los clientes asignados. Sin señal no hace nada: la cola espera.
  const sincronizar = async (): Promise<void> => {
    if (!vinculadaRef.current || sincronizandoRef.current) return;
    sincronizandoRef.current = true;
    try {
      const { data: sesion } = await supabase.auth.getSession();
      const uid = sesion.session?.user.id;
      if (!uid) return;
      const { data: miembro, error } = await supabase.from("miembros").select("organizacion_id").eq("user_id", uid).maybeSingle();
      if (error) return; // sin señal
      if (!miembro) return desvincularLocal();
      const org = miembro.organizacion_id;

      while (colaRef.current.length > 0) {
        const p = colaRef.current[0];
        const { error: e } =
          p.tipo === "visita"
            ? await supabase.from("visitas").upsert(
                { id: p.id, organizacion_id: org, vendedor_id: uid, cliente_id: p.cliente_id, visitada_en: p.visitada_en, ultima_visita_anterior: p.ultima_visita_anterior },
                { onConflict: "id", ignoreDuplicates: true },
              )
            : p.tipo === "borrar_visita"
              ? await supabase.from("visitas").delete().eq("id", p.id)
              : p.tipo === "ubicacion"
                ? await supabase.from("clientes").update({ lat: p.lat, lng: p.lng, direccion: p.direccion, geo_status: p.geo_status }).eq("id", p.cliente_id)
                : await supabase.from("prospectos").upsert(
                    { id: p.id, organizacion_id: org, vendedor_id: uid, nombre: p.nombre, rut: p.rut, direccion: p.direccion, lat: p.lat, lng: p.lng },
                    { onConflict: "id", ignoreDuplicates: true },
                  );
        // Sin código = no hubo respuesta del servidor: se reintenta después. Con código, el servidor lo
        // rechazó (por ejemplo, el admin borró el cliente): se descarta para no trabar la cola.
        if (e && !e.code) return;
        if (e) console.warn("Cambio rechazado por el servidor, se descarta", p.tipo, e.message);
        colaRef.current = colaRef.current.slice(1);
        setPendientesSync(colaRef.current.length);
        await AsyncStorage.setItem(STORAGE_KEY_COLA, JSON.stringify(colaRef.current));
      }

      // Km y recorrido del día; los puntos se reducen a 300 para no subir miles por jornada
      const puntos = trayectoriaRealRef.current;
      const paso = Math.max(1, Math.ceil(puntos.length / 300));
      const { error: eKm } = await supabase.from("recorridos").upsert(
        {
          organizacion_id: org,
          vendedor_id: uid,
          fecha: obtenerFechaHoy(),
          km: Math.round(kmRecorridosRealesRef.current * 100) / 100,
          puntos: puntos.filter((_, i) => i % paso === 0).map((pt) => [pt.latitude, pt.longitude]),
        },
        { onConflict: "vendedor_id,fecha" },
      );
      if (eKm && !eKm.code) return;

      const { data: filas, error: eClientes } = await supabase
        .from("clientes")
        .select("id, nombre, rut, direccion, lat, lng, geo_status, ultima_visita")
        .eq("vendedor_id", uid)
        .order("nombre");
      if (eClientes || !filas) return;
      await guardarClientes(() => clientesDesdeServidor(filas, colaRef.current), true);

      const ahora = new Date().toISOString();
      setUltimaSync(ahora);
      await AsyncStorage.setItem(STORAGE_KEY_ULTIMA_SYNC, ahora);
    } catch (e) {
      console.warn("Sincronización pendiente", e);
    } finally {
      sincronizandoRef.current = false;
    }
  };

  // Reintenta al recuperar señal, cada 15 minutos y al salir de la app (cierre de jornada)
  useEffect(() => {
    if (!vinculada) return;
    if (conectado) sincronizar();
    const intervalo = setInterval(sincronizar, INTERVALO_SYNC_MS);
    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "background") sincronizar();
    });
    return () => {
      clearInterval(intervalo);
      sub.remove();
    };
  }, [vinculada, conectado]);

  const vincularCon = async (token: string): Promise<string | null> => {
    try {
      // Sesión anónima: el vendedor no crea cuenta, el QR lo identifica
      const { data: sesion } = await supabase.auth.getSession();
      if (!sesion.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) return mensajeErrorVinculo(error.message);
      }
      const { data: organizacionId, error } = await supabase.rpc("canjear_invitacion", { p_token: token });
      if (error) return mensajeErrorVinculo(error.message);
      const { data: org } = await supabase.from("organizaciones").select("nombre").eq("id", organizacionId).single();
      const nombre = org?.nombre ?? "tu empresa";
      await AsyncStorage.multiSet([[STORAGE_KEY_VINCULADA, "true"], [STORAGE_KEY_EMPRESA, nombre]]);
      // Los clientes de demo eran de prueba: desde ahora la lista es la que asigna la empresa
      await AsyncStorage.removeItem(STORAGE_KEY_VISITAS);
      await guardarClientes(() => [], true);
      setRuta([]);
      vinculadaRef.current = true;
      setVinculada(true);
      setEmpresa(nombre);
      sincronizar();
      return null;
    } catch (e) {
      return mensajeErrorVinculo(String(e));
    }
  };

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
  // desdeServidor: la lista viene de la empresa y no hay nada que subir
  const guardarClientes = async (
    actualizar: (lista: Cliente[]) => Cliente[],
    desdeServidor = false,
  ): Promise<void> => {
    const anterior = new Map(clientesRef.current.map((c) => [c.id, c]));
    const nuevaLista = actualizar(clientesRef.current);
    // Vinculada: toda corrección de ubicación o dirección hecha en terreno se encola para subir
    if (vinculadaRef.current && !desdeServidor) {
      for (const c of nuevaLista) {
        const a = anterior.get(c.id);
        if (!a || c.geoStatus === "pendiente") continue;
        if (a.lat !== c.lat || a.lng !== c.lng || a.direccion !== c.direccion || a.geoStatus !== c.geoStatus)
          encolar({ tipo: "ubicacion", cliente_id: c.id, lat: c.lat ?? null, lng: c.lng ?? null, direccion: c.direccion, geo_status: c.geoStatus });
      }
    }
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
    // Vinculada: el vendedor no crea clientes, propone prospectos que la empresa revisa en el panel
    if (vinculada) {
      if (!nombre.trim()) {
        Alert.alert("Falta el nombre", "Escribe el nombre del prospecto");
        return false;
      }
      if (rut.trim() && !formatoRutValido(rut)) {
        Alert.alert("RUT inválido", "Revisa el RUT ingresado o déjalo en blanco");
        return false;
      }
      await encolar({
        tipo: "prospecto",
        id: uuid(),
        nombre: nombre.trim(),
        rut: rut.trim() ? formatearRut(rut) : "",
        direccion: direccion.trim(),
        lat: posicionVendedor?.latitude ?? null,
        lng: posicionVendedor?.longitude ?? null,
      });
      sincronizar();
      Alert.alert("Prospecto enviado", "Tu empresa lo verá en el panel y decidirá si lo agrega a tu cartera.");
      return true;
    }
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
      id: uuid(),
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
    await encolar({
      tipo: "visita",
      id: nuevaVisita.id!,
      cliente_id: cliente.id,
      visitada_en: new Date().toISOString(),
      ultima_visita_anterior: nuevaVisita.ultimaVisitaAnterior ?? null,
    });
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
    if (registro?.id) await encolar({ tipo: "borrar_visita", id: registro.id });
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
        empresa,
        vincularCon,
        pendientesSync,
        ultimaSync,
        sincronizar,
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
