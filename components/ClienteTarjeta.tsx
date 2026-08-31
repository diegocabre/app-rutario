import { formatoRutValido } from "@/services/rut";
import { Cliente } from "@/types/cliente";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  cliente: Cliente;
  conectado: boolean;
  onGuardarDireccion: (id: string, nuevaDireccion: string) => void;
  onGuardarRut: (id: string, nuevoRut: string) => boolean;
  onReintentar: (id: string) => void;
  onEliminar: (id: string) => void;
}

export default function ClienteTarjeta({
  cliente,
  conectado,
  onGuardarDireccion,
  onGuardarRut,
  onReintentar,
  onEliminar,
}: Props) {
  const [editandoDireccion, setEditandoDireccion] = useState(false);
  const [direccionEditada, setDireccionEditada] = useState(cliente.direccion);
  const [editandoRut, setEditandoRut] = useState(false);
  const [rutEditado, setRutEditado] = useState(cliente.rut);

  const guardarDireccion = () => {
    onGuardarDireccion(cliente.id, direccionEditada);
    setEditandoDireccion(false);
  };

  const guardarRut = () => {
    if (onGuardarRut(cliente.id, rutEditado)) {
      setEditandoRut(false);
    }
  };

  if (editandoDireccion) {
    return (
      <View style={styles.tarjeta}>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombreCliente}>{cliente.nombre}</Text>
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
              onPress={guardarDireccion}
            >
              <Text style={styles.botonGuardarTexto}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tarjeta}>
      <View style={{ flex: 1 }}>
        <Text style={styles.nombreCliente}>{cliente.nombre}</Text>

        {editandoRut ? (
          <View style={styles.edicionContainer}>
            <TextInput
              style={styles.inputEdicion}
              value={rutEditado}
              onChangeText={setRutEditado}
              placeholder="RUT (ej: 12345678-9)"
              autoCapitalize="characters"
              autoFocus
            />
            <TouchableOpacity style={styles.botonGuardar} onPress={guardarRut}>
              <Text style={styles.botonGuardarTexto}>Guardar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.rutCliente}>
              {cliente.rut}
              {!formatoRutValido(cliente.rut) && "  ⚠️ formato inválido"}
            </Text>
            {!formatoRutValido(cliente.rut) && (
              <TouchableOpacity onPress={() => setEditandoRut(true)}>
                <Text style={styles.editarTexto}>✏️ Corregir RUT</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <Text style={styles.direccionCliente}>{cliente.direccion}</Text>
        <Text style={styles.geoEstado}>
          {cliente.geoStatus === "pendiente" && "📍 Ubicando..."}
          {cliente.geoStatus === "ok" && "✅ Ubicado"}
          {cliente.geoStatus === "aproximado" &&
            "🟠 Ubicación aproximada, ajusta en el Mapa"}
          {(cliente.geoStatus === "error" ||
            cliente.geoStatus === "no_encontrado") &&
            "⚠️ No se encontró, corrige la dirección o ubica en el Mapa"}
          {cliente.geoStatus === "sin_conexion" &&
            "📡 Sin conexión, reintenta cuando tengas señal"}
        </Text>

        {cliente.geoStatus === "sin_conexion" && conectado && (
          <TouchableOpacity onPress={() => onReintentar(cliente.id)}>
            <Text style={styles.editarTexto}>🔄 Reintentar ahora</Text>
          </TouchableOpacity>
        )}

        {(cliente.geoStatus === "error" ||
          cliente.geoStatus === "no_encontrado") && (
          <TouchableOpacity onPress={() => setEditandoDireccion(true)}>
            <Text style={styles.editarTexto}>✏️ Editar dirección</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity onPress={() => onEliminar(cliente.id)}>
        <Text style={styles.eliminar}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  tarjeta: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  nombreCliente: { fontSize: 16, fontWeight: "600" },
  rutCliente: { fontSize: 12, color: "#999", marginTop: 1 },
  direccionCliente: { fontSize: 14, color: "#666", marginTop: 2 },
  geoEstado: { fontSize: 12, color: "#888", marginTop: 2 },
  eliminar: { fontSize: 18, color: "#e11d48", paddingHorizontal: 8 },
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
});
