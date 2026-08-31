import ClienteTarjeta from "@/components/ClienteTarjeta";
import { useClientes } from "@/hooks/use-clientes";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useState } from "react";
import {
  FlatList,
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
    borrarTodosLosClientes,
    eliminarCliente,
    reintentarGeocodificacion,
    guardarCorreccionDireccion,
    guardarCorreccionRut,
  } = useClientes();

  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");

  const handleAgregar = async () => {
    await agregarCliente(nombre, rut, direccion);
    setNombre("");
    setRut("");
    setDireccion("");
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

      <FlatList
        data={clientes}
        keyExtractor={(item) => item.id}
        style={styles.lista}
        ListEmptyComponent={
          <Text style={styles.vacio}>Aún no tienes clientes agregados</Text>
        }
        renderItem={({ item }) => (
          <ClienteTarjeta
            cliente={item}
            conectado={conectado}
            onGuardarDireccion={guardarCorreccionDireccion}
            onGuardarRut={guardarCorreccionRut}
            onReintentar={reintentarGeocodificacion}
            onEliminar={eliminarCliente}
          />
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
