import ClienteTarjeta from "@/components/ClienteTarjeta";
import { useClientes } from "@/context/ClientesContext";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { LIMITE_DEMO, URL_PRODUCTO } from "@/services/demo";
import { Cliente } from "@/types/cliente";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ListaClientes() {
  const conectado = useNetworkStatus();
  const {
    clientes,
    importando,
    progresoImport,
    agregando,
    agregarCliente,
    importarCSV,
    exportarClientes,
    borrarTodosLosClientes,
    eliminarCliente,
    reintentarGeocodificacion,
    guardarCorreccionDireccion,
    guardarCorreccionRut,
    ubicarEnPosicionActual,
    vinculada,
    empresa,
  } = useClientes();
  const router = useRouter();

  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const texto = busqueda.trim().toUpperCase();
  const clientesFiltrados = texto
    ? clientes.filter(
        (c) =>
          c.nombre.toUpperCase().includes(texto) ||
          c.rut.toUpperCase().includes(texto) ||
          c.direccion.toUpperCase().includes(texto),
      )
    : clientes;

  const ubicarAqui = (cliente: Cliente) => {
    Alert.alert(
      "¿Estás en este cliente?",
      `Se guardará tu ubicación actual como la de ${cliente.nombre} y se actualizará su dirección.`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Guardar", onPress: () => ubicarEnPosicionActual(cliente) },
      ],
    );
  };

  const ubicarEnMapa = (id: string) =>
    router.navigate({ pathname: "/(tabs)/explore", params: { ubicar: id } });

  const handleAgregar = async () => {
    if (!(await agregarCliente(nombre, rut, direccion))) return;
    setNombre("");
    setRut("");
    setDireccion("");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {!conectado && (
          <View style={styles.bannerOffline}>
            <Text style={styles.bannerOfflineTexto}>
              📡 Sin conexión — no se pueden ubicar clientes nuevos ahora
            </Text>
          </View>
        )}

        {vinculada ? (
          <Text style={styles.textoVinculada}>Vinculada a {empresa}</Text>
        ) : (
          <View style={styles.bannerDemo}>
            <Text style={styles.bannerDemoTexto}>
              {clientes.length <= LIMITE_DEMO
                ? `Demo · ${clientes.length} de ${LIMITE_DEMO} clientes`
                : `Demo · límite de ${LIMITE_DEMO} clientes alcanzado`}
            </Text>
            <View style={styles.bannerDemoAcciones}>
              <TouchableOpacity onPress={() => router.push("/vincular")}>
                <Text style={styles.bannerDemoAccion}>Vincular con mi empresa</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openURL(URL_PRODUCTO)}>
                <Text style={styles.bannerDemoAccion}>Ver planes →</Text>
              </TouchableOpacity>
            </View>
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
          {clientes.length > 0 && (
            <TouchableOpacity
              style={styles.botonImportar}
              onPress={exportarClientes}
            >
              <Text style={styles.botonImportarTexto}>
                📤 Exportar {clientes.length} clientes (respaldo)
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.botonBorrarTodo}
            onPress={borrarTodosLosClientes}
          >
            <Text style={styles.botonBorrarTodoTexto}>
              🗑️ Borrar todos los clientes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.boton, agregando && styles.botonDeshabilitado]}
            onPress={handleAgregar}
            disabled={agregando}
          >
            <Text style={styles.botonTexto}>
              {agregando ? "Agregando..." : "+ Agregar Cliente"}
            </Text>
          </TouchableOpacity>
        </View>

        {clientes.length > 0 && (
          <TextInput
            style={styles.input}
            placeholder={`🔍 Buscar entre ${clientes.length} clientes (nombre, RUT o dirección)`}
            value={busqueda}
            onChangeText={setBusqueda}
            clearButtonMode="while-editing"
          />
        )}

        <FlatList
          data={clientesFiltrados}
          keyExtractor={(item) => item.id}
          style={styles.lista}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.vacio}>
              {texto
                ? "Ningún cliente coincide con la búsqueda"
                : "Aún no tienes clientes agregados"}
            </Text>
          }
          renderItem={({ item }) => (
            <ClienteTarjeta
              cliente={item}
              conectado={conectado}
              onGuardarDireccion={guardarCorreccionDireccion}
              onGuardarRut={guardarCorreccionRut}
              onReintentar={reintentarGeocodificacion}
              onEliminar={eliminarCliente}
              onUbicarAqui={ubicarAqui}
              onUbicarEnMapa={ubicarEnMapa}
            />
          )}
        />
      </KeyboardAvoidingView>
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
  botonDeshabilitado: { opacity: 0.6 },
  lista: { flex: 1 },
  vacio: { textAlign: "center", color: "#999", marginTop: 24 },
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
  bannerDemo: {
    gap: 6,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  bannerDemoTexto: { color: "#3730a3", fontSize: 13, fontWeight: "600" },
  bannerDemoAccion: { color: "#4338ca", fontSize: 13, fontWeight: "600", paddingVertical: 4 },
  bannerDemoAcciones: { flexDirection: "row", justifyContent: "space-between" },
  textoVinculada: { color: "#047857", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  botonBorrarTodo: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e11d48",
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    marginTop: 8,
  },
  botonBorrarTodoTexto: { color: "#e11d48", fontWeight: "600", fontSize: 13 },
});
