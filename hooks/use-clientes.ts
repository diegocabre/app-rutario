import { parsearCSV } from "@/services/csv";
import { geocodificarDireccion } from "@/services/geocoding";
import { formatearRut, formatoRutValido, limpiarRut } from "@/services/rut";
import { Cliente } from "@/types/cliente";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";
import { Alert } from "react-native";

const STORAGE_KEY = "clientes";

export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [importando, setImportando] = useState(false);
  const [progresoImport, setProgresoImport] = useState({
    actual: 0,
    total: 0,
  });
  const [agregando, setAgregando] = useState(false);

  useEffect(() => {
    cargarClientes();
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
    guardarClientes(listaConNuevo);

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
          geoStatus: "pendiente" as const,
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
      guardarClientes(listaActual);

      for (let i = 0; i < nuevosClientes.length; i++) {
        const cliente = nuevosClientes[i];
        const resultadoGeo = await geocodificarDireccion(cliente.direccion);

        listaActual = listaActual.map((c) =>
          c.id === cliente.id
            ? {
                ...c,
                lat:
                  resultadoGeo.status === "ok"
                    ? resultadoGeo.coords.lat
                    : undefined,
                lng:
                  resultadoGeo.status === "ok"
                    ? resultadoGeo.coords.lng
                    : undefined,
                geoStatus: resultadoGeo.status,
              }
            : c,
        );
        guardarClientes(listaActual);
        setProgresoImport({ actual: i + 1, total: nuevosClientes.length });

        if (i < nuevosClientes.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
      }

      const idsRecienImportados = new Set(nuevosClientes.map((c) => c.id));
      const conError = listaActual.filter(
        (c) =>
          idsRecienImportados.has(c.id) &&
          (c.geoStatus === "error" || c.geoStatus === "sin_conexion"),
      );
      const ubicadosOk = nuevosClientes.length - conError.length;

      setImportando(false);

      const nombresConError = conError
        .slice(0, 8)
        .map((c) => `• ${c.nombre}`)
        .join("\n");
      const yMas =
        conError.length > 8 ? `\n...y ${conError.length - 8} más` : "";

      let mensaje = `✅ ${ubicadosOk} clientes importados y ubicados correctamente.`;

      if (conError.length > 0) {
        mensaje += `\n\n⚠️ ${conError.length} no se pudieron ubicar:\n${nombresConError}${yMas}\n\nBusca "✏️ Editar dirección" en cada uno para corregirlos.`;
      }
      if (duplicadosOmitidos > 0) {
        mensaje += `\n\n${duplicadosOmitidos} duplicados omitidos (RUT ya existente).`;
      }
      if (invalidosOmitidos > 0) {
        mensaje += `\n\n${invalidosOmitidos} sin RUT, omitidos.`;
      }

      Alert.alert("Importación completa", mensaje);
    } catch (e: any) {
      setImportando(false);
      Alert.alert("Error", e.message ?? "Error al importar el archivo");
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
            guardarClientes(clientes.filter((c) => c.id !== id));
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
    guardarClientes(listaPendiente);

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

  // Devuelve true si se guardó bien, false si falló validación
  // (así el componente sabe si debe cerrar el modo edición o no)
  const guardarCorreccionRut = (
    clienteId: string,
    nuevoRut: string,
  ): boolean => {
    if (!nuevoRut.trim()) return false;

    if (!formatoRutValido(nuevoRut)) {
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

  return {
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
  };
}
