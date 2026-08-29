import { useNetworkStatus } from "@/hooks/use-network-status";
import { parsearCSV } from "@/services/csv";
import { geocodificarDireccion } from "@/services/geocoding";
import { formatearRut, formatoRutValido, limpiarRut } from "@/services/rut";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const STORAGE_KEY = "clientes";

interface Cliente {
  rut: string;
  id: string;
  nombre: string;
  direccion: string;
  lat?: number;
  lng?: number;
  geoStatus: "pendiente" | "ok" | "error" | "sin_conexion" | "no_encontrado";
}

export default function ListaClientes() {
  const conectado = useNetworkStatus();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [rut, setRut] = useState<string>("");
  const [nombre, setNombre] = useState<string>("");
  const [direccion, setDireccion] = useState<string>("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [direccionEditada, setDireccionEditada] = useState<string>("");
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState({ actual: 0, total: 0 });
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    cargarClientes();
  }, []);

  const cargarClientes = async (): Promise<void> => {
    try {
      const data: string | null = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const clientesGuardados: Cliente[] = JSON.parse(data) as Cliente[];
        setClientes(clientesGuardados);
      }
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

  const agregarCliente = async (): Promise<void> => {
    if (!nombre.trim() || !direccion.trim() || !rut.trim()) {
      Alert.alert("Faltan datos", "Nombre, RUT y dirección son obligatorios");
      return;
    }

    if (!formatoRutValido(rut)) {
      Alert.alert(
        "RUT inválido",
        "Revisa el RUT ingresado, el dígito verificador no calza",
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
    guardarClientes(listaConNuevo);
    setNombre("");
    setRut("");
    setDireccion("");

    const resultado = await geocodificarDireccion(nuevoCliente.direccion);

    const listaActualizada = listaConNuevo.map((c) =>
      c.id === nuevoCliente.id
        ? {
            ...c,
            lat: resultado.status === "ok" ? resultado.coords.lat : undefined,
            lng: resultado.status === "ok" ? resultado.coords.lng : undefined,
            geoStatus: resultado.status,
          }
        : c,
    );

    guardarClientes(listaActualizada);
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
        alert("El archivo no tiene clientes válidos para importar");
        return;
      }

      setImportando(true);
      setProgresoImport({ actual: 0, total: filas.length });

      // Agrega todos primero como "pendiente" para verlos aparecer de inmediato
      const rutsExistentes = new Set(clientes.map((c) => limpiarRut(c.rut)));
      const rutsEnEsteArchivo = new Set<string>();
      let duplicadosOmitidos = 0;
      let invalidosOmitidos = 0;

      const nuevosClientes: Cliente[] = [];

      for (const fila of filas) {
        if (!formatoRutValido(fila.rut)) {
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
          rut: formatearRut(fila.rut),
          direccion: fila.direccion,
          geoStatus: "pendiente" as const,
        });
      }

      if (nuevosClientes.length === 0) {
        setImportando(false);
        if (duplicadosOmitidos > 0 || invalidosOmitidos > 0) {
          Alert.alert(
            "Importación completa",
            `Se agregaron ${nuevosClientes.length} clientes.\n` +
              (duplicadosOmitidos > 0
                ? `${duplicadosOmitidos} duplicados omitidos.\n`
                : "") +
              (invalidosOmitidos > 0
                ? `${invalidosOmitidos} con RUT inválido omitidos.`
                : ""),
          );
        }
        Alert.alert(
          "Nada que importar",
          `Todos los registros ya existían o tenían RUT inválido (${duplicadosOmitidos} duplicados, ${invalidosOmitidos} inválidos)`,
        );
        return;
      }
      let listaActual = [...clientes, ...nuevosClientes];
      guardarClientes(listaActual);

      // Geocodifica uno por uno, esperando ~1.1s entre cada uno
      // (Nominatim solo permite 1 solicitud por segundo)
      for (let i = 0; i < nuevosClientes.length; i++) {
        const cliente = nuevosClientes[i];
        const resultado = await geocodificarDireccion(cliente.direccion);

        listaActual = listaActual.map((c) =>
          c.id === cliente.id
            ? {
                ...c,
                lat:
                  resultado.status === "ok" ? resultado.coords.lat : undefined,
                lng:
                  resultado.status === "ok" ? resultado.coords.lng : undefined,
                geoStatus: resultado.status,
              }
            : c,
        );
        guardarClientes(listaActual);
        setProgresoImport({ actual: i + 1, total: nuevosClientes.length });

        if (i < nuevosClientes.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      setImportando(false);
    } catch (e: any) {
      setImportando(false);
      alert(e.message ?? "Error al importar el archivo");
      console.error("Error importando CSV", e);
    }
  };

  const eliminarCliente = (id: string): void => {
    const cliente = clientes.find((c) => c.id === id);

    Alert.alert(
      "Eliminar cliente",
      `¿Seguro que quieres eliminar a ${cliente?.nombre ?? "este cliente"}? Esta acción no se puede deshacer.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => {
            const nuevaLista = clientes.filter((c) => c.id !== id);
            guardarClientes(nuevaLista);
          },
        },
      ],
    );
  };

  const reintentarGeocodificacion = async (
    clienteId: string,
  ): Promise<void> => {
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return;

    const listaPendiente = clientes.map((c) =>
      c.id === clienteId ? { ...c, geoStatus: "pendiente" as const } : c,
    );
    guardarClientes(listaPendiente);

    const resultado = await geocodificarDireccion(cliente.direccion);

    const listaFinal = listaPendiente.map((c) =>
      c.id === clienteId
        ? {
            ...c,
            lat: resultado.status === "ok" ? resultado.coords.lat : undefined,
            lng: resultado.status === "ok" ? resultado.coords.lng : undefined,
            geoStatus: resultado.status,
          }
        : c,
    );
    guardarClientes(listaFinal);
  };

  const guardarCorreccion = async (clienteId: string): Promise<void> => {
    if (!direccionEditada.trim()) return;

    const listaPendiente = clientes.map((c) =>
      c.id === clienteId
        ? {
            ...c,
            direccion: direccionEditada.trim(),
            geoStatus: "pendiente" as const,
          }
        : c,
    );
    guardarClientes(listaPendiente);
    setEditandoId(null);

    const clienteActualizado = listaPendiente.find((c) => c.id === clienteId)!;
    const resultado = await geocodificarDireccion(clienteActualizado.direccion);

    const listaFinal = listaPendiente.map((c) =>
      c.id === clienteId
        ? {
            ...c,
            lat: resultado.status === "ok" ? resultado.coords.lat : undefined,
            lng: resultado.status === "ok" ? resultado.coords.lng : undefined,
            geoStatus: resultado.status,
          }
        : c,
    );
    guardarClientes(listaFinal);
  };

  return (
    <SafeAreaView style={styles.container}>
      {!conectado && (
        <View style={styles.bannerOffline}>
          <Text style={styles.bannerOfflineTexto}>
            📡 Sin conexión — no se pueden ubicar clientes nuevos ahora
          </Text>
        </View>
      )}
      <Text style={styles.titulo}>Mis Clientes</Text>

      <View style={styles.formulario}>
        <TextInput
          style={styles.input}
          placeholder="RUT (ej: 12345678-9)"
          value={rut}
          onChangeText={setRut}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="Nombre del cliente"
          value={nombre}
          onChangeText={setNombre}
        />
        <TextInput
          style={styles.input}
          placeholder="Dirección"
          value={direccion}
          onChangeText={setDireccion}
        />
        <TouchableOpacity
          style={styles.botonImportar}
          onPress={importarCSV}
          disabled={importando}
        >
          <Text style={styles.botonImportarTexto}>
            {importando
              ? `Geocodificando ${progresoImport.actual}/${progresoImport.total}...`
              : "📂 Importar desde CSV"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.boton, agregando && styles.botonDeshabilitado]}
          onPress={agregarCliente}
          disabled={agregando}
        >
          <Text style={styles.botonTexto}>
            {agregando ? "Agregando..." : "+ Agregar Cliente"}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={clientes}
        keyExtractor={(item) => item.id}
        style={styles.lista}
        ListEmptyComponent={
          <Text style={styles.vacio}>Aún no tienes clientes agregados</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.tarjeta}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombreCliente}>{item.nombre}</Text>

              {editandoId === item.id ? (
                <View style={styles.edicionContainer}>
                  <TextInput
                    style={styles.inputEdicion}
                    value={direccionEditada}
                    onChangeText={setDireccionEditada}
                    placeholder="Nueva dirección"
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.botonGuardar}
                    onPress={() => guardarCorreccion(item.id)}
                  >
                    <Text style={styles.botonGuardarTexto}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.rutCliente}>{item.rut}</Text>
                  <Text style={styles.direccionCliente}>{item.direccion}</Text>
                  <Text style={styles.geoEstado}>
                    {item.geoStatus === "pendiente" && "📍 Ubicando..."}
                    {item.geoStatus === "ok" && "✅ Ubicado"}
                    {item.geoStatus === "error" &&
                      "⚠️ No se encontró, corrige la dirección"}
                    {item.geoStatus === "sin_conexion" &&
                      "📡 Sin conexión, reintenta cuando tengas señal"}
                  </Text>

                  {item.geoStatus === "sin_conexion" && conectado && (
                    <TouchableOpacity
                      onPress={() => reintentarGeocodificacion(item.id)}
                    >
                      <Text style={styles.editarTexto}>
                        🔄 Reintentar ahora
                      </Text>
                    </TouchableOpacity>
                  )}

                  {item.geoStatus === "error" && (
                    <TouchableOpacity
                      onPress={() => {
                        setEditandoId(item.id);
                        setDireccionEditada(item.direccion);
                      }}
                    >
                      <Text style={styles.editarTexto}>
                        ✏️ Editar dirección
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>

            <TouchableOpacity onPress={() => eliminarCliente(item.id)}>
              <Text style={styles.eliminar}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5", padding: 16 },
  titulo: { fontSize: 24, fontWeight: "bold", marginBottom: 16 },
  formulario: { marginBottom: 16 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  boton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  botonTexto: { color: "#fff", fontWeight: "bold" },
  lista: { flex: 1 },
  vacio: { textAlign: "center", color: "#999", marginTop: 24 },
  tarjeta: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  nombreCliente: { fontSize: 16, fontWeight: "600" },
  direccionCliente: { fontSize: 14, color: "#666", marginTop: 2 },
  eliminar: { fontSize: 18, color: "#e11d48", paddingHorizontal: 8 },
  geoEstado: { fontSize: 12, color: "#888", marginTop: 2 },
  edicionContainer: { marginTop: 4 },
  inputEdicion: {
    backgroundColor: "#f5f5f5",
    borderRadius: 6,
    padding: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  botonGuardar: {
    backgroundColor: "#2563eb",
    borderRadius: 6,
    padding: 8,
    alignItems: "center",
  },
  botonGuardarTexto: { color: "#fff", fontWeight: "600", fontSize: 13 },
  editarTexto: { color: "#2563eb", fontSize: 13, marginTop: 4 },
  botonImportar: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  botonImportarTexto: { color: "#2563eb", fontWeight: "600" },
  bannerOffline: {
    backgroundColor: "#fef3c7",
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  bannerOfflineTexto: { color: "#92400e", fontSize: 12, textAlign: "center" },
  botonDeshabilitado: { opacity: 0.6 },
  rutCliente: { fontSize: 12, color: "#999", marginTop: 1 },
});
