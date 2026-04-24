export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      alertas_escalamiento: {
        Row: {
          created_at: string
          id: number
          personal_id: number
          rol_notificado: string | null
          trigger_message_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          personal_id: number
          rol_notificado?: string | null
          trigger_message_id: number
        }
        Update: {
          created_at?: string
          id?: number
          personal_id?: number
          rol_notificado?: string | null
          trigger_message_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "alertas_escalamiento_msg_fk"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_escalamiento_msg_fk"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "v_conversation_messages_basic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_escalamiento_personal_fk"
            columns: ["personal_id"]
            isOneToOne: false
            referencedRelation: "personal_ac"
            referencedColumns: ["id"]
          },
        ]
      }
      articulos: {
        Row: {
          codigo_articulo: string
          estado: string | null
          id: number
          nombre: string
          peso_standard_kg: number | null
          tipo_mercado: string
        }
        Insert: {
          codigo_articulo: string
          estado?: string | null
          id?: number
          nombre: string
          peso_standard_kg?: number | null
          tipo_mercado: string
        }
        Update: {
          codigo_articulo?: string
          estado?: string | null
          id?: number
          nombre?: string
          peso_standard_kg?: number | null
          tipo_mercado?: string
        }
        Relationships: []
      }
      camiones: {
        Row: {
          created_at: string | null
          id: number
          marca: string | null
          modelo: string | null
          observaciones: string | null
          patente: string
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          marca?: string | null
          modelo?: string | null
          observaciones?: string | null
          patente: string
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          marca?: string | null
          modelo?: string | null
          observaciones?: string | null
          patente?: string
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      catalogo_tareas_control: {
        Row: {
          id: number
          orden_sugerido: number | null
          requiere_aviso: boolean | null
          requiere_foto: boolean | null
          tarea_template: string
          tipo_tarea: string | null
        }
        Insert: {
          id?: number
          orden_sugerido?: number | null
          requiere_aviso?: boolean | null
          requiere_foto?: boolean | null
          tarea_template: string
          tipo_tarea?: string | null
        }
        Update: {
          id?: number
          orden_sugerido?: number | null
          requiere_aviso?: boolean | null
          requiere_foto?: boolean | null
          tarea_template?: string
          tipo_tarea?: string | null
        }
        Relationships: []
      }
      choferes: {
        Row: {
          dni: string | null
          email: string | null
          estado: string | null
          id: number
          nombre_completo: string
          telefono: string | null
          transportista_id: number | null
        }
        Insert: {
          dni?: string | null
          email?: string | null
          estado?: string | null
          id?: number
          nombre_completo: string
          telefono?: string | null
          transportista_id?: number | null
        }
        Update: {
          dni?: string | null
          email?: string | null
          estado?: string | null
          id?: number
          nombre_completo?: string
          telefono?: string | null
          transportista_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "choferes_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          calle: string | null
          codigo_postal: string | null
          codigo_tango: string | null
          contacto_principal_id: number | null
          created_at: string | null
          cuit: string | null
          email_general: string | null
          estado: string | null
          id: number
          latitude: number | null
          localidad: string | null
          longitude: number | null
          numero: string | null
          pais: string | null
          provincia: string | null
          razon_social: string
          telefono_general: string | null
        }
        Insert: {
          calle?: string | null
          codigo_postal?: string | null
          codigo_tango?: string | null
          contacto_principal_id?: number | null
          created_at?: string | null
          cuit?: string | null
          email_general?: string | null
          estado?: string | null
          id?: number
          latitude?: number | null
          localidad?: string | null
          longitude?: number | null
          numero?: string | null
          pais?: string | null
          provincia?: string | null
          razon_social: string
          telefono_general?: string | null
        }
        Update: {
          calle?: string | null
          codigo_postal?: string | null
          codigo_tango?: string | null
          contacto_principal_id?: number | null
          created_at?: string | null
          cuit?: string | null
          email_general?: string | null
          estado?: string | null
          id?: number
          latitude?: number | null
          localidad?: string | null
          longitude?: number | null
          numero?: string | null
          pais?: string | null
          provincia?: string | null
          razon_social?: string
          telefono_general?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_contacto_principal"
            columns: ["contacto_principal_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
        ]
      }
      contactos: {
        Row: {
          cliente_id: number | null
          dni_cuil: string | null
          email: string | null
          estado: string | null
          id: number
          nombre: string
          proveedor_id: number | null
          role_id: number | null
          telefono: string | null
          transportista_id: number | null
        }
        Insert: {
          cliente_id?: number | null
          dni_cuil?: string | null
          email?: string | null
          estado?: string | null
          id?: number
          nombre: string
          proveedor_id?: number | null
          role_id?: number | null
          telefono?: string | null
          transportista_id?: number | null
        }
        Update: {
          cliente_id?: number | null
          dni_cuil?: string | null
          email?: string | null
          estado?: string | null
          id?: number
          nombre?: string
          proveedor_id?: number | null
          role_id?: number | null
          telefono?: string | null
          transportista_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contactos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contactos_transportista_id_fkey"
            columns: ["transportista_id"]
            isOneToOne: false
            referencedRelation: "transportistas"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          body_text: string | null
          conversation_id: number
          created_at: string
          direction: string
          from_address: string | null
          id: number
          media_urls: string[] | null
          message_type: string
          provider: string
          provider_message_id: string | null
          raw_payload: Json | null
          sender_id: number | null
          sender_role: string
          to_address: string | null
        }
        Insert: {
          body_text?: string | null
          conversation_id: number
          created_at?: string
          direction: string
          from_address?: string | null
          id?: number
          media_urls?: string[] | null
          message_type?: string
          provider?: string
          provider_message_id?: string | null
          raw_payload?: Json | null
          sender_id?: number | null
          sender_role?: string
          to_address?: string | null
        }
        Update: {
          body_text?: string | null
          conversation_id?: number
          created_at?: string
          direction?: string
          from_address?: string | null
          id?: number
          media_urls?: string[] | null
          message_type?: string
          provider?: string
          provider_message_id?: string | null
          raw_payload?: Json | null
          sender_id?: number | null
          sender_role?: string
          to_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "personal_ac"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: string
          conversation_key: string
          created_at: string
          estado_atencion: string
          id: number
          last_activity_at: string
          participant_id: number | null
          participant_role: string
          remito_actual_id: number | null
        }
        Insert: {
          channel?: string
          conversation_key: string
          created_at?: string
          estado_atencion?: string
          id?: number
          last_activity_at?: string
          participant_id?: number | null
          participant_role?: string
          remito_actual_id?: number | null
        }
        Update: {
          channel?: string
          conversation_key?: string
          created_at?: string
          estado_atencion?: string
          id?: number
          last_activity_at?: string
          participant_id?: number | null
          participant_role?: string
          remito_actual_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_remito_actual_id_fkey"
            columns: ["remito_actual_id"]
            isOneToOne: false
            referencedRelation: "remitos"
            referencedColumns: ["id"]
          },
        ]
      }
      debug_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      debug_log_fsm: {
        Row: {
          details: Json | null
          event: string | null
          function_name: string | null
          instance_id: number | null
          level: string | null
          log_id: number
          message: string | null
          payload: Json | null
          ref_type: string | null
          ref_value: string | null
          source_name: string | null
          source_type: string | null
          step: string | null
          timestamp: string | null
        }
        Insert: {
          details?: Json | null
          event?: string | null
          function_name?: string | null
          instance_id?: number | null
          level?: string | null
          log_id?: number
          message?: string | null
          payload?: Json | null
          ref_type?: string | null
          ref_value?: string | null
          source_name?: string | null
          source_type?: string | null
          step?: string | null
          timestamp?: string | null
        }
        Update: {
          details?: Json | null
          event?: string | null
          function_name?: string | null
          instance_id?: number | null
          level?: string | null
          log_id?: number
          message?: string | null
          payload?: Json | null
          ref_type?: string | null
          ref_value?: string | null
          source_name?: string | null
          source_type?: string | null
          step?: string | null
          timestamp?: string | null
        }
        Relationships: []
      }
      depositos: {
        Row: {
          calle: string | null
          codigo_postal: string | null
          id: number
          latitude: number | null
          localidad: string | null
          longitude: number | null
          nombre: string
          numero: string | null
          pais: string | null
          provincia: string | null
          tipo: string
        }
        Insert: {
          calle?: string | null
          codigo_postal?: string | null
          id?: number
          latitude?: number | null
          localidad?: string | null
          longitude?: number | null
          nombre: string
          numero?: string | null
          pais?: string | null
          provincia?: string | null
          tipo: string
        }
        Update: {
          calle?: string | null
          codigo_postal?: string | null
          id?: number
          latitude?: number | null
          localidad?: string | null
          longitude?: number | null
          nombre?: string
          numero?: string | null
          pais?: string | null
          provincia?: string | null
          tipo?: string
        }
        Relationships: []
      }
      documentos: {
        Row: {
          document_type: string
          id: number
          oc_instance_id: number | null
          pedido_instance_id: number | null
          remito_id: number | null
          storage_path: string
          uploaded_at: string | null
        }
        Insert: {
          document_type: string
          id?: number
          oc_instance_id?: number | null
          pedido_instance_id?: number | null
          remito_id?: number | null
          storage_path: string
          uploaded_at?: string | null
        }
        Update: {
          document_type?: string
          id?: number
          oc_instance_id?: number | null
          pedido_instance_id?: number | null
          remito_id?: number | null
          storage_path?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_oc_instance_id_fkey"
            columns: ["oc_instance_id"]
            isOneToOne: false
            referencedRelation: "oc_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "pedido_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_elegibles_inspeccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_diagnostico_vagones"
            referencedColumns: ["instancia_id"]
          },
          {
            foreignKeyName: "documentos_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_monitor_instancias_activas"
            referencedColumns: ["instancia_id"]
          },
          {
            foreignKeyName: "documentos_remito_id_fkey"
            columns: ["remito_id"]
            isOneToOne: false
            referencedRelation: "remitos"
            referencedColumns: ["id"]
          },
        ]
      }
      fsm_definitions: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      fsm_transitions: {
        Row: {
          from_state_id: number
          id: number
          priority: number | null
          to_state_id: number
          trigger_type: Database["public"]["Enums"]["transition_trigger_type"]
          trigger_validation_code: string | null
        }
        Insert: {
          from_state_id: number
          id?: number
          priority?: number | null
          to_state_id: number
          trigger_type: Database["public"]["Enums"]["transition_trigger_type"]
          trigger_validation_code?: string | null
        }
        Update: {
          from_state_id?: number
          id?: number
          priority?: number | null
          to_state_id?: number
          trigger_type?: Database["public"]["Enums"]["transition_trigger_type"]
          trigger_validation_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fsm_transitions_from_state_id_fkey"
            columns: ["from_state_id"]
            isOneToOne: false
            referencedRelation: "state_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fsm_transitions_to_state_id_fkey"
            columns: ["to_state_id"]
            isOneToOne: false
            referencedRelation: "state_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fsm_transitions_trigger_validation_code_fkey"
            columns: ["trigger_validation_code"]
            isOneToOne: false
            referencedRelation: "validation_definitions"
            referencedColumns: ["validation_code"]
          },
        ]
      }
      historial_eventos: {
        Row: {
          description: string
          details: Json | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: number
          inspeccion_id: number | null
          oc_instance_id: number | null
          pedido_instance_id: number | null
          timestamp: string
          user_actor: string | null
        }
        Insert: {
          description: string
          details?: Json | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: number
          inspeccion_id?: number | null
          oc_instance_id?: number | null
          pedido_instance_id?: number | null
          timestamp?: string
          user_actor?: string | null
        }
        Update: {
          description?: string
          details?: Json | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: number
          inspeccion_id?: number | null
          oc_instance_id?: number | null
          pedido_instance_id?: number | null
          timestamp?: string
          user_actor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historial_eventos_inspeccion_id_fkey"
            columns: ["inspeccion_id"]
            isOneToOne: false
            referencedRelation: "inspecciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_eventos_inspeccion_id_fkey"
            columns: ["inspeccion_id"]
            isOneToOne: false
            referencedRelation: "v_inspecciones_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_eventos_oc_instance_id_fkey"
            columns: ["oc_instance_id"]
            isOneToOne: false
            referencedRelation: "oc_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_eventos_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "pedido_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_eventos_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_elegibles_inspeccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historial_eventos_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_diagnostico_vagones"
            referencedColumns: ["instancia_id"]
          },
          {
            foreignKeyName: "historial_eventos_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_monitor_instancias_activas"
            referencedColumns: ["instancia_id"]
          },
        ]
      }
      inspeccion_items_pedido: {
        Row: {
          created_at: string | null
          id: number
          inspeccion_id: number | null
          pedido_instance_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          inspeccion_id?: number | null
          pedido_instance_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          inspeccion_id?: number | null
          pedido_instance_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inspeccion_items_pedido_inspeccion_id_fkey"
            columns: ["inspeccion_id"]
            isOneToOne: false
            referencedRelation: "inspecciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspeccion_items_pedido_inspeccion_id_fkey"
            columns: ["inspeccion_id"]
            isOneToOne: false
            referencedRelation: "v_inspecciones_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspeccion_items_pedido_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "pedido_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspeccion_items_pedido_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_elegibles_inspeccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspeccion_items_pedido_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_diagnostico_vagones"
            referencedColumns: ["instancia_id"]
          },
          {
            foreignKeyName: "inspeccion_items_pedido_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_monitor_instancias_activas"
            referencedColumns: ["instancia_id"]
          },
        ]
      }
      inspeccion_templates: {
        Row: {
          activo: boolean | null
          archivo_url: string
          codigo: string
          created_at: string | null
          id: number
          nombre: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          archivo_url: string
          codigo: string
          created_at?: string | null
          id?: number
          nombre: string
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          archivo_url?: string
          codigo?: string
          created_at?: string | null
          id?: number
          nombre?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      inspecciones: {
        Row: {
          created_at: string | null
          current_data: Json | null
          current_state_id: number | null
          export_doc_status: string | null
          fecha_hora_carga_pactada: string
          id: number
          inspector_id: number | null
          lugar_carga_id: number | null
          planilla_completada_url: string | null
          planilla_personalizada_url: string | null
          planilla_url: string | null
          remito_id: number | null
          resultado_final: string | null
          template_id: number | null
          tipo_carga: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_data?: Json | null
          current_state_id?: number | null
          export_doc_status?: string | null
          fecha_hora_carga_pactada: string
          id?: number
          inspector_id?: number | null
          lugar_carga_id?: number | null
          planilla_completada_url?: string | null
          planilla_personalizada_url?: string | null
          planilla_url?: string | null
          remito_id?: number | null
          resultado_final?: string | null
          template_id?: number | null
          tipo_carga?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_data?: Json | null
          current_state_id?: number | null
          export_doc_status?: string | null
          fecha_hora_carga_pactada?: string
          id?: number
          inspector_id?: number | null
          lugar_carga_id?: number | null
          planilla_completada_url?: string | null
          planilla_personalizada_url?: string | null
          planilla_url?: string | null
          remito_id?: number | null
          resultado_final?: string | null
          template_id?: number | null
          tipo_carga?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspecciones_current_state_id_fkey"
            columns: ["current_state_id"]
            isOneToOne: false
            referencedRelation: "state_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecciones_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "personal_ac"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecciones_lugar_carga_id_fkey"
            columns: ["lugar_carga_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecciones_remito_id_fkey"
            columns: ["remito_id"]
            isOneToOne: false
            referencedRelation: "remitos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspecciones_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspeccion_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      lugares_pesaje: {
        Row: {
          created_at: string | null
          direccion: string | null
          estado: string | null
          google_maps_link: string | null
          id: number
          nombre: string
        }
        Insert: {
          created_at?: string | null
          direccion?: string | null
          estado?: string | null
          google_maps_link?: string | null
          id?: number
          nombre: string
        }
        Update: {
          created_at?: string | null
          direccion?: string | null
          estado?: string | null
          google_maps_link?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      magic_links: {
        Row: {
          created_at: string | null
          expires_at: string
          instancia_id: number
          tipo_entidad: string
          token: string
          used_at: string | null
          usuario_email: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          instancia_id: number
          tipo_entidad: string
          token?: string
          used_at?: string | null
          usuario_email?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          instancia_id?: number
          tipo_entidad?: string
          token?: string
          used_at?: string | null
          usuario_email?: string | null
        }
        Relationships: []
      }
      message_media: {
        Row: {
          content_type: string | null
          created_at: string
          id: number
          media_index: number
          message_id: number
          storage_bucket: string
          storage_path: string
          storage_url: string | null
          twilio_media_url: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          id?: number
          media_index?: number
          message_id: number
          storage_bucket?: string
          storage_path: string
          storage_url?: string | null
          twilio_media_url?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          id?: number
          media_index?: number
          message_id?: number
          storage_bucket?: string
          storage_path?: string
          storage_url?: string | null
          twilio_media_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_media_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_media_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "v_conversation_messages_basic"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_refresh_events: {
        Row: {
          id: number
          mv_name: string
          refreshed_at: string
        }
        Insert: {
          id?: number
          mv_name: string
          refreshed_at?: string
        }
        Update: {
          id?: number
          mv_name?: string
          refreshed_at?: string
        }
        Relationships: []
      }
      oc_instancias: {
        Row: {
          cantidad_disponible: number
          cantidad_total: number
          created_at: string | null
          current_data: Json | null
          current_state_id: number
          id: number
          identificador_compuesto: string | null
          oc_id: number
          parent_instance_id: number | null
          status: Database["public"]["Enums"]["instance_status"]
          updated_at: string | null
        }
        Insert: {
          cantidad_disponible: number
          cantidad_total: number
          created_at?: string | null
          current_data?: Json | null
          current_state_id: number
          id?: number
          identificador_compuesto?: string | null
          oc_id: number
          parent_instance_id?: number | null
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string | null
        }
        Update: {
          cantidad_disponible?: number
          cantidad_total?: number
          created_at?: string | null
          current_data?: Json | null
          current_state_id?: number
          id?: number
          identificador_compuesto?: string | null
          oc_id?: number
          parent_instance_id?: number | null
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oc_instancias_current_state_id_fkey"
            columns: ["current_state_id"]
            isOneToOne: false
            referencedRelation: "state_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_instancias_oc_id_fkey"
            columns: ["oc_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_instancias_parent_instance_id_fkey"
            columns: ["parent_instance_id"]
            isOneToOne: false
            referencedRelation: "oc_instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra: {
        Row: {
          cantidad_total_ton: number | null
          created_at: string | null
          fecha_emision: string | null
          id: number
          oc_ref_externa: string | null
          precio_neto_kg: number | null
          proveedor_id: number | null
          tipo_operatoria: string
        }
        Insert: {
          cantidad_total_ton?: number | null
          created_at?: string | null
          fecha_emision?: string | null
          id?: number
          oc_ref_externa?: string | null
          precio_neto_kg?: number | null
          proveedor_id?: number | null
          tipo_operatoria: string
        }
        Update: {
          cantidad_total_ton?: number | null
          created_at?: string | null
          fecha_emision?: string | null
          id?: number
          oc_ref_externa?: string | null
          precio_neto_kg?: number | null
          proveedor_id?: number | null
          tipo_operatoria?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_instancias: {
        Row: {
          cantidad_requerida_original: number | null
          created_at: string | null
          current_data: Json | null
          current_state_id: number
          id: number
          identificador_compuesto: string | null
          parent_instance_id: number | null
          pedido_id: number
          saldo_pendiente: number
          status: Database["public"]["Enums"]["instance_status"]
          updated_at: string | null
        }
        Insert: {
          cantidad_requerida_original?: number | null
          created_at?: string | null
          current_data?: Json | null
          current_state_id: number
          id?: number
          identificador_compuesto?: string | null
          parent_instance_id?: number | null
          pedido_id: number
          saldo_pendiente: number
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string | null
        }
        Update: {
          cantidad_requerida_original?: number | null
          created_at?: string | null
          current_data?: Json | null
          current_state_id?: number
          id?: number
          identificador_compuesto?: string | null
          parent_instance_id?: number | null
          pedido_id?: number
          saldo_pendiente?: number
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_instancias_current_state_id_fkey"
            columns: ["current_state_id"]
            isOneToOne: false
            referencedRelation: "state_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_instancias_parent_instance_id_fkey"
            columns: ["parent_instance_id"]
            isOneToOne: false
            referencedRelation: "pedido_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_instancias_parent_instance_id_fkey"
            columns: ["parent_instance_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_elegibles_inspeccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_instancias_parent_instance_id_fkey"
            columns: ["parent_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_diagnostico_vagones"
            referencedColumns: ["instancia_id"]
          },
          {
            foreignKeyName: "pedido_instancias_parent_instance_id_fkey"
            columns: ["parent_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_monitor_instancias_activas"
            referencedColumns: ["instancia_id"]
          },
          {
            foreignKeyName: "pedido_instancias_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          cantidad_total_ton: number | null
          cliente_id: number | null
          cotizacion_archivo_url: string | null
          created_at: string | null
          fecha_pedido: string | null
          historial_cotizaciones: Json | null
          id: number
          pedido_ref_externa: string | null
          precio_neto_kg: number | null
          tipo_mercado: string
        }
        Insert: {
          cantidad_total_ton?: number | null
          cliente_id?: number | null
          cotizacion_archivo_url?: string | null
          created_at?: string | null
          fecha_pedido?: string | null
          historial_cotizaciones?: Json | null
          id?: number
          pedido_ref_externa?: string | null
          precio_neto_kg?: number | null
          tipo_mercado: string
        }
        Update: {
          cantidad_total_ton?: number | null
          cliente_id?: number | null
          cotizacion_archivo_url?: string | null
          created_at?: string | null
          fecha_pedido?: string | null
          historial_cotizaciones?: Json | null
          id?: number
          pedido_ref_externa?: string | null
          precio_neto_kg?: number | null
          tipo_mercado?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_ac: {
        Row: {
          auth_user_id: string | null
          celular: string | null
          dni: string | null
          email: string
          estado: string | null
          id: number
          nombre_completo: string
          password_temporal: string | null
          tipo_contratacion: string | null
        }
        Insert: {
          auth_user_id?: string | null
          celular?: string | null
          dni?: string | null
          email: string
          estado?: string | null
          id?: number
          nombre_completo: string
          password_temporal?: string | null
          tipo_contratacion?: string | null
        }
        Update: {
          auth_user_id?: string | null
          celular?: string | null
          dni?: string | null
          email?: string
          estado?: string | null
          id?: number
          nombre_completo?: string
          password_temporal?: string | null
          tipo_contratacion?: string | null
        }
        Relationships: []
      }
      personal_ac_roles: {
        Row: {
          personal_ac_id: number
          role_id: number
        }
        Insert: {
          personal_ac_id: number
          role_id: number
        }
        Update: {
          personal_ac_id?: number
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "personal_ac_roles_personal_ac_id_fkey"
            columns: ["personal_ac_id"]
            isOneToOne: false
            referencedRelation: "personal_ac"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_ac_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          calle: string | null
          codigo_postal: string | null
          codigo_proveedor: string | null
          contacto_principal_id: number | null
          created_at: string | null
          cuit: string | null
          email_general: string | null
          estado: string | null
          id: number
          latitude: number | null
          localidad: string | null
          longitude: number | null
          numero: string | null
          pais: string | null
          provincia: string | null
          razon_social: string
          telefono_general: string | null
        }
        Insert: {
          calle?: string | null
          codigo_postal?: string | null
          codigo_proveedor?: string | null
          contacto_principal_id?: number | null
          created_at?: string | null
          cuit?: string | null
          email_general?: string | null
          estado?: string | null
          id?: number
          latitude?: number | null
          localidad?: string | null
          longitude?: number | null
          numero?: string | null
          pais?: string | null
          provincia?: string | null
          razon_social: string
          telefono_general?: string | null
        }
        Update: {
          calle?: string | null
          codigo_postal?: string | null
          codigo_proveedor?: string | null
          contacto_principal_id?: number | null
          created_at?: string | null
          cuit?: string | null
          email_general?: string | null
          estado?: string | null
          id?: number
          latitude?: number | null
          localidad?: string | null
          longitude?: number | null
          numero?: string | null
          pais?: string | null
          provincia?: string | null
          razon_social?: string
          telefono_general?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_contacto_principal"
            columns: ["contacto_principal_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
        ]
      }
      remito_items: {
        Row: {
          cantidad: number
          created_at: string | null
          destino_instance_id: number | null
          id: number
          origen_instance_id: number
          origen_type: string | null
          remito_id: number
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          destino_instance_id?: number | null
          id?: number
          origen_instance_id: number
          origen_type?: string | null
          remito_id: number
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          destino_instance_id?: number | null
          id?: number
          origen_instance_id?: number
          origen_type?: string | null
          remito_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "remito_items_remito_id_fkey"
            columns: ["remito_id"]
            isOneToOne: false
            referencedRelation: "remitos"
            referencedColumns: ["id"]
          },
        ]
      }
      remitos: {
        Row: {
          acoplado_id: number | null
          archivo_url: string | null
          bruto_pesaje_lugar_id: number | null
          bruto_pesaje_momento: string | null
          camion_id: number | null
          camion_patente: string | null
          cantidad: number | null
          cantidad_total: number | null
          chofer_id: number | null
          contexto_asignacion: Json | null
          cotizacion_url: string | null
          created_at: string | null
          email_remitente: string | null
          estado_asignacion: string | null
          id: number
          inspector_id: number | null
          instrucciones_texto: string | null
          metadata_extraida: Json | null
          operador_id: number | null
          parent_remito_id: number | null
          protocolo_control: Json | null
          remito_ref_externa: string
          supervisor_id: number | null
          tara_pesaje_lugar_id: number | null
          tara_pesaje_momento: string | null
          updated_at: string | null
        }
        Insert: {
          acoplado_id?: number | null
          archivo_url?: string | null
          bruto_pesaje_lugar_id?: number | null
          bruto_pesaje_momento?: string | null
          camion_id?: number | null
          camion_patente?: string | null
          cantidad?: number | null
          cantidad_total?: number | null
          chofer_id?: number | null
          contexto_asignacion?: Json | null
          cotizacion_url?: string | null
          created_at?: string | null
          email_remitente?: string | null
          estado_asignacion?: string | null
          id?: number
          inspector_id?: number | null
          instrucciones_texto?: string | null
          metadata_extraida?: Json | null
          operador_id?: number | null
          parent_remito_id?: number | null
          protocolo_control?: Json | null
          remito_ref_externa: string
          supervisor_id?: number | null
          tara_pesaje_lugar_id?: number | null
          tara_pesaje_momento?: string | null
          updated_at?: string | null
        }
        Update: {
          acoplado_id?: number | null
          archivo_url?: string | null
          bruto_pesaje_lugar_id?: number | null
          bruto_pesaje_momento?: string | null
          camion_id?: number | null
          camion_patente?: string | null
          cantidad?: number | null
          cantidad_total?: number | null
          chofer_id?: number | null
          contexto_asignacion?: Json | null
          cotizacion_url?: string | null
          created_at?: string | null
          email_remitente?: string | null
          estado_asignacion?: string | null
          id?: number
          inspector_id?: number | null
          instrucciones_texto?: string | null
          metadata_extraida?: Json | null
          operador_id?: number | null
          parent_remito_id?: number | null
          protocolo_control?: Json | null
          remito_ref_externa?: string
          supervisor_id?: number | null
          tara_pesaje_lugar_id?: number | null
          tara_pesaje_momento?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remitos_acoplado_id_fkey"
            columns: ["acoplado_id"]
            isOneToOne: false
            referencedRelation: "camiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_bruto_pesaje_lugar_id_fkey"
            columns: ["bruto_pesaje_lugar_id"]
            isOneToOne: false
            referencedRelation: "lugares_pesaje"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_camion_id_fkey"
            columns: ["camion_id"]
            isOneToOne: false
            referencedRelation: "camiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_chofer_id_fkey"
            columns: ["chofer_id"]
            isOneToOne: false
            referencedRelation: "choferes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "personal_ac"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "personal_ac"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_parent_remito_id_fkey"
            columns: ["parent_remito_id"]
            isOneToOne: false
            referencedRelation: "remitos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "personal_ac"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remitos_tara_pesaje_lugar_id_fkey"
            columns: ["tara_pesaje_lugar_id"]
            isOneToOne: false
            referencedRelation: "lugares_pesaje"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          codigo: string | null
          id: number
          nombre: string
        }
        Insert: {
          codigo?: string | null
          id?: number
          nombre: string
        }
        Update: {
          codigo?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      servicios: {
        Row: {
          codigo_servicio: string
          id: number
          nombre: string
        }
        Insert: {
          codigo_servicio: string
          id?: number
          nombre: string
        }
        Update: {
          codigo_servicio?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      state_definitions: {
        Row: {
          description: string | null
          fsm_id: number
          id: number
          name: string
          state_code: string
        }
        Insert: {
          description?: string | null
          fsm_id: number
          id?: number
          name: string
          state_code: string
        }
        Update: {
          description?: string | null
          fsm_id?: number
          id?: number
          name?: string
          state_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_definitions_fsm_id_fkey"
            columns: ["fsm_id"]
            isOneToOne: false
            referencedRelation: "fsm_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      state_validation_requirements: {
        Row: {
          state_id: number
          validation_id: number
        }
        Insert: {
          state_id: number
          validation_id: number
        }
        Update: {
          state_id?: number
          validation_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "state_validation_requirements_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "state_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_validation_requirements_validation_id_fkey"
            columns: ["validation_id"]
            isOneToOne: false
            referencedRelation: "validation_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      status: {
        Row: {
          "?column?": string | null
        }
        Insert: {
          "?column?"?: string | null
        }
        Update: {
          "?column?"?: string | null
        }
        Relationships: []
      }
      transportistas: {
        Row: {
          contacto_principal_id: number | null
          created_at: string | null
          cuit: string | null
          estado: string | null
          id: number
          nombre_empresa: string
        }
        Insert: {
          contacto_principal_id?: number | null
          created_at?: string | null
          cuit?: string | null
          estado?: string | null
          id?: number
          nombre_empresa: string
        }
        Update: {
          contacto_principal_id?: number | null
          created_at?: string | null
          cuit?: string | null
          estado?: string | null
          id?: number
          nombre_empresa?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_contacto_principal"
            columns: ["contacto_principal_id"]
            isOneToOne: false
            referencedRelation: "contactos"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_definitions: {
        Row: {
          description: string | null
          id: number
          is_blocking: boolean
          name: string
          validation_code: string
        }
        Insert: {
          description?: string | null
          id?: number
          is_blocking?: boolean
          name: string
          validation_code: string
        }
        Update: {
          description?: string | null
          id?: number
          is_blocking?: boolean
          name?: string
          validation_code?: string
        }
        Relationships: []
      }
      vinculaciones_pedido_oc: {
        Row: {
          aprobacion_excepcional: boolean
          cantidad_vinculada: number
          created_at: string | null
          estado_vinculacion: string
          id: number
          margen_rentabilidad_calculado: number | null
          oc_instance_id: number
          pedido_instance_id: number
        }
        Insert: {
          aprobacion_excepcional?: boolean
          cantidad_vinculada: number
          created_at?: string | null
          estado_vinculacion?: string
          id?: number
          margen_rentabilidad_calculado?: number | null
          oc_instance_id: number
          pedido_instance_id: number
        }
        Update: {
          aprobacion_excepcional?: boolean
          cantidad_vinculada?: number
          created_at?: string | null
          estado_vinculacion?: string
          id?: number
          margen_rentabilidad_calculado?: number | null
          oc_instance_id?: number
          pedido_instance_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vinculaciones_pedido_oc_oc_instance_id_fkey"
            columns: ["oc_instance_id"]
            isOneToOne: false
            referencedRelation: "oc_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculaciones_pedido_oc_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "pedido_instancias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculaciones_pedido_oc_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_elegibles_inspeccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculaciones_pedido_oc_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_diagnostico_vagones"
            referencedColumns: ["instancia_id"]
          },
          {
            foreignKeyName: "vinculaciones_pedido_oc_pedido_instance_id_fkey"
            columns: ["pedido_instance_id"]
            isOneToOne: false
            referencedRelation: "vw_monitor_instancias_activas"
            referencedColumns: ["instancia_id"]
          },
        ]
      }
    }
    Views: {
      mv_analisis_logistico: {
        Row: {
          actor_nombre: string | null
          fsm_name: string | null
          generated_at: string | null
          lista_instancias: Json | null
          qty_amarillo: number | null
          qty_rojo: number | null
          qty_verde: number | null
          state_name: string | null
          ton_amarillo: number | null
          ton_rojo: number | null
          ton_verde: number | null
        }
        Relationships: []
      }
      mv_detalle_instancias_activas: {
        Row: {
          cantidad_ton: number | null
          created_at: string | null
          entidad_nombre: string | null
          fsm_entity: string | null
          identificador_compuesto: string | null
          instance_id: number | null
          ref_externa: string | null
          state_code: string | null
          state_name: string | null
          time_in_state_formatted: string | null
          time_in_state_seconds: number | null
          tipo_mercado: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      mv_instancias_analitica: {
        Row: {
          current_state_id: number | null
          fsm_id: number | null
          fsm_name: string | null
          state_code: string | null
          state_name: string | null
          status: Database["public"]["Enums"]["instance_status"] | null
          total_instancias: number | null
        }
        Relationships: []
      }
      mv_instancias_por_estado: {
        Row: {
          current_state_id: number | null
          fsm_id: number | null
          fsm_name: string | null
          lista_instancias: Json | null
          state_code: string | null
          state_name: string | null
          total_instancias: number | null
        }
        Relationships: []
      }
      mv_tiempo_promedio_estado: {
        Row: {
          avg_duration_formatted: string | null
          avg_duration_seconds: number | null
          fsm_name: string | null
          state_code: string | null
          state_name: string | null
        }
        Relationships: []
      }
      mv_tiempo_promedio_por_resultado: {
        Row: {
          avg_duration: string | null
          fsm_name: string | null
          state_code: string | null
          state_name: string | null
          status_final: Database["public"]["Enums"]["instance_status"] | null
        }
        Relationships: []
      }
      v_conversation_messages_basic: {
        Row: {
          body_text: string | null
          conversation_id: number | null
          created_at: string | null
          direction: string | null
          id: number | null
          message_type: string | null
          sender_role: string | null
        }
        Insert: {
          body_text?: string | null
          conversation_id?: number | null
          created_at?: string | null
          direction?: string | null
          id?: number | null
          message_type?: string | null
          sender_role?: string | null
        }
        Update: {
          body_text?: string | null
          conversation_id?: number | null
          created_at?: string | null
          direction?: string | null
          id?: number | null
          message_type?: string | null
          sender_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inspecciones_kanban: {
        Row: {
          export_doc_status: string | null
          fecha_pactada: string | null
          id: number | null
          inspector_nombre: string | null
          pedidos: Json | null
          planilla_completada_url: string | null
          resultado_final: string | null
          state_code: string | null
          tipo_carga: string | null
        }
        Relationships: []
      }
      v_pedidos_elegibles_inspeccion: {
        Row: {
          articulo: string | null
          cliente: string | null
          id: number | null
          identificador: string | null
          saldo_pendiente: number | null
          tipo_mercado: string | null
        }
        Relationships: []
      }
      vw_diagnostico_vagones: {
        Row: {
          bolsas_50kg_vagon: number | null
          caminos_posibles: string[] | null
          cliente: string | null
          cod_estado: string | null
          instancia_id: number | null
          kilos_vagon: number | null
          nombre_estado: string | null
          nro_oc: string | null
          nro_pedido: string | null
          nro_remito: string | null
          proveedor: string | null
          referencia_humana: string | null
          tareas_faltantes: Json | null
          toneladas_vagon: number | null
        }
        Relationships: []
      }
      vw_monitor_instancias_activas: {
        Row: {
          bolsas_50kg_originales: number | null
          cliente: string | null
          color_alerta: string | null
          estado_actual: string | null
          horas_transcurridas: number | null
          instancia_id: number | null
          nro_pedido: string | null
          nro_remito: string | null
          proveedor: string | null
          proximos_estados: string[] | null
          referencia_humana: string | null
          tareas_faltantes: Json | null
          tipo_mercado: string | null
          toneladas_actuales: number | null
          toneladas_originales: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      actualizar_datos_inspeccion: {
        Args: {
          p_fecha: string
          p_id: number
          p_inspector_id: number
          p_lugar_id: number
          p_usuario_actor: string
        }
        Returns: boolean
      }
      actualizar_instrucciones_remito: {
        Args: {
          p_datos_instrucciones: Json
          p_referencia_externa: string
          p_usuario_email: string
        }
        Returns: Json
      }
      actualizar_y_revalidar: {
        Args: { p_datos_nuevos_json: Json; p_instancia_id: number }
        Returns: Json
      }
      actualizar_y_revalidar_oc: {
        Args: { p_datos_nuevos_json: Json; p_instancia_id: number }
        Returns: Json
      }
      actualizar_y_revalidar_v3: {
        Args: { p_datos_nuevos_json: Json; p_instancia_id: number }
        Returns: Json
      }
      avanzar_oc_post_aprobacion: {
        Args: { p_pedido_instance_id: number; p_user_actor: string }
        Returns: Json
      }
      check_and_buffer_remito: {
        Args: {
          p_archivo_url: string
          p_cantidad_total: number
          p_cotizacion_url: string
          p_email_remitente: string
          p_metadata: Json
          p_numero_remito: string
        }
        Returns: Json
      }
      crear_nueva_inspeccion: {
        Args: {
          p_fecha_pactada: string
          p_inspector_id: number
          p_lugar_id: number
          p_pedido_instance_ids: number[]
          p_tipo_carga: string
          p_usuario_actor: string
        }
        Returns: number
      }
      crear_nueva_inspeccion_v2: {
        Args: {
          p_fecha_pactada: string
          p_inspector_id: number
          p_lugar_id: number
          p_pedido_instance_ids: number[]
          p_template_id: number
          p_tipo_carga: string
          p_usuario_actor: string
        }
        Returns: number
      }
      desvincular_pedido_oc: {
        Args: {
          p_motivo: string
          p_usuario_solicitante: string
          p_vinculacion_id: number
        }
        Returns: Json
      }
      ejecutar_asignacion_remito: {
        Args: {
          p_cantidad_asignada: number
          p_origen_instance_id: number
          p_origen_type: string
          p_remito_id: number
        }
        Returns: Json
      }
      ejecutar_validaciones_iniciales: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      ejecutar_validaciones_oc: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_161: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_162: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_101: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_102: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_103: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_104: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_105: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_106: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_107: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_108: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_109: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_oc_110: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_117: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_151: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_152: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_153: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_154: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_311: {
        Args: { p_datos: Json; p_instancia_id: number }
        Returns: Json
      }
      f_val_p_312: {
        Args: { p_datos: Json; p_instancia_id: number }
        Returns: Json
      }
      f_val_p_313: {
        Args: { p_datos: Json; p_instancia_id: number }
        Returns: Json
      }
      f_val_p_314: {
        Args: { p_datos: Json; p_instancia_id: number }
        Returns: Json
      }
      f_val_p_315: {
        Args: { p_datos: Json; p_instancia_id: number }
        Returns: Json
      }
      f_val_p_me_101: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_102: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_103: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_104: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_105: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_106: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_107: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_108: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_109: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_110: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_111: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_112: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_113: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_114: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_115: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_me_116: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_101: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_102: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_103: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_104: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_105: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_106: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_107: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_108: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_109: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_110: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_111: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_112: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      f_val_p_mi_113: {
        Args: { p_instancia_id: number; p_json_data: Json }
        Returns: Json
      }
      finalizar_inspeccion: {
        Args: {
          p_id: number
          p_observaciones: string
          p_resultado: string
          p_usuario: string
        }
        Returns: Json
      }
      finalizar_provision_personal_ac: {
        Args: {
          p_auth_user_id: string
          p_password_temporal: string
          p_personal_ac_id: number
          p_role_nombre?: string
        }
        Returns: Json
      }
      generate_magic_link: {
        Args: {
          p_instancia_id: number
          p_tipo_entidad: string
          p_usuario_email: string
          p_validez?: string
        }
        Returns: string
      }
      get_asunto_instancia:
        | { Args: { p_instancia_id: number }; Returns: string }
        | { Args: { p_instancia_id: number; p_tipo?: string }; Returns: string }
      get_candidatos_para_remito:
        | { Args: never; Returns: Json }
        | { Args: { p_cantidad_remito: number }; Returns: Json }
      get_data_for_magic_link: { Args: { p_token: string }; Returns: Json }
      get_full_context_by_remito: {
        Args: { p_remito_id: number }
        Returns: Json
      }
      get_full_context_by_token: { Args: { p_token: string }; Returns: Json }
      get_inspeccion_by_token: { Args: { p_token: string }; Returns: Json }
      get_instance_lineage: {
        Args: { p_identificador_humano: string }
        Returns: Json
      }
      get_instance_requirements: {
        Args: { p_instance_id: number; p_type: string }
        Returns: Json
      }
      get_pedido_instance_for_manual_action: {
        Args: { p_identificador_compuesto: string }
        Returns: {
          instance_id: number
          state_code: string
        }[]
      }
      get_remitos_activos: { Args: never; Returns: Json }
      get_vinculacion_details: {
        Args: { p_pedido_hija_id: number }
        Returns: {
          cantidad_vinculada: number
          margen_calculado: number
          margen_requerido: number
          oc_ref: string
          pedido_madre_saldo_restante: number
          pedido_ref: string
        }[]
      }
      insertar_oc_si_nueva: {
        Args: { oc_json: Json }
        Returns: {
          estado_actual_out: string
          identificador_compuesto_out: string
          instancia_id_out: number
          oc_ref_externa_out: string
        }[]
      }
      insertar_pedido_si_nuevo: {
        Args: { pedido_json: Json }
        Returns: {
          estado_actual_out: string
          identificador_compuesto_out: string
          instancia_id_out: number
          pedido_ref_externa_out: string
        }[]
      }
      inspeccion_completar_resultados: {
        Args: { p_archivo_url: string; p_token: string }
        Returns: boolean
      }
      inspeccion_forzar_transicion: {
        Args: {
          p_inspeccion_id: number
          p_motivo_excepcion: string
          p_nuevo_estado_code: string
          p_usuario_actor: string
        }
        Returns: Json
      }
      inspeccion_intentar_transicion: {
        Args: {
          p_inspeccion_id: number
          p_nuevo_estado_code: string
          p_usuario_actor: string
        }
        Returns: Json
      }
      intentar_transicion_automatica_oc: {
        Args: { p_instancia_id: number }
        Returns: Json
      }
      intentar_transicion_automatica_pedido: {
        Args: { p_instancia_id: number }
        Returns: Json
      }
      intentar_transicion_automatica_pedido_v3: {
        Args: { p_instancia_id: number }
        Returns: Json
      }
      is_debug_enabled: { Args: { p_key?: string }; Returns: boolean }
      log_debug_fsm: {
        Args: {
          p_event?: string
          p_force?: boolean
          p_instance_id: number
          p_level?: string
          p_message: string
          p_payload?: Json
          p_ref_type?: string
          p_ref_value?: string
          p_source_name?: string
          p_source_type?: string
        }
        Returns: undefined
      }
      log_fsm_debug: {
        Args: {
          p_details?: Json
          p_instancia_id: number
          p_message: string
          p_process: string
        }
        Returns: undefined
      }
      log_inspeccion_evento: {
        Args: {
          p_accion: string
          p_detalles?: Json
          p_inspeccion_id: number
          p_usuario_actor: string
        }
        Returns: undefined
      }
      obtener_proximos_estados: {
        Args: { p_estado_id: number }
        Returns: string[]
      }
      procesar_actualizacion_manual: {
        Args: {
          p_datos_nuevos: Json
          p_referencia_externa: string
          p_usuario_email: string
        }
        Returns: Json
      }
      process_1_6_decision: {
        Args: {
          p_decision: string
          p_instancia_id: number
          p_remitente: string
        }
        Returns: Json
      }
      process_approval_decision: {
        Args: {
          p_decision: string
          p_instancia_id: number
          p_remitente: string
        }
        Returns: Json
      }
      process_approval_decision_v3: {
        Args: {
          p_decision: string
          p_instancia_id: number
          p_remitente: string
        }
        Returns: Json
      }
      rollback_asignacion_remito: {
        Args: {
          p_motivo: string
          p_remito_item_id: number
          p_usuario_solicitante: string
        }
        Returns: Json
      }
      save_remito_update_admin: {
        Args: { p_admin_email: string; p_remito_id: number; p_updates: Json }
        Returns: Json
      }
      save_remito_update_v3: {
        Args: { p_token: string; p_updates: Json }
        Returns: Json
      }
      seconds_to_ddhhmmss: { Args: { total_seconds: number }; Returns: string }
      sp_vincular_pedido_oc: {
        Args: {
          p_cantidad_a_vincular: number
          p_oc_ref_externa: string
          p_pedido_ref_externa: string
          p_remitente_actor: string
          p_unidades: string
        }
        Returns: Json
      }
      transicionar_instancia_manual: {
        Args: {
          p_instancia_id: number
          p_motivo: string
          p_nuevo_estado_code: string
          p_usuario_nombre: string
        }
        Returns: Json
      }
      transicionar_instancia_oc: {
        Args: { p_instancia_id: number; p_nuevo_state_code: string }
        Returns: Json
      }
      transicionar_oc_a_calzada: {
        Args: { p_pedido_instance_id: number; p_user_actor: string }
        Returns: Json
      }
      update_remito_context: {
        Args: { p_contexto: Json; p_remito_id: number }
        Returns: undefined
      }
      validate_magic_link: { Args: { p_token: string }; Returns: Json }
    }
    Enums: {
      event_type:
        | "STATE_TRANSITION"
        | "VALIDATION_SUCCESS"
        | "VALIDATION_FAILURE"
        | "VALIDATION_DENIED"
        | "ALARM_TRIGGERED"
        | "INPUT_RECEIVED"
        | "OUTPUT_SENT"
        | "MANUAL_OVERRIDE"
        | "INSTANCE_CREATED"
        | "NOTE_ADDED"
        | "INSTANCE_UPDATED"
        | "VOTE_RECEIVED"
        | "ROLLBACK_REMITO_RECOVERY"
        | "DATA_UPDATE"
      instance_status: "ACTIVA" | "COMPLETADA" | "ANULADA" | "RECHAZADA"
      transition_condition_type: "ON_SUCCESS" | "ON_FAILURE" | "ON_DENIAL"
      transition_trigger_type:
        | "ON_ALL_SUCCESS"
        | "ON_VALIDATION_FAILURE"
        | "ON_VALIDATION_DENIAL"
        | "ON_INPUT_RECEIVED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      event_type: [
        "STATE_TRANSITION",
        "VALIDATION_SUCCESS",
        "VALIDATION_FAILURE",
        "VALIDATION_DENIED",
        "ALARM_TRIGGERED",
        "INPUT_RECEIVED",
        "OUTPUT_SENT",
        "MANUAL_OVERRIDE",
        "INSTANCE_CREATED",
        "NOTE_ADDED",
        "INSTANCE_UPDATED",
        "VOTE_RECEIVED",
        "ROLLBACK_REMITO_RECOVERY",
        "DATA_UPDATE",
      ],
      instance_status: ["ACTIVA", "COMPLETADA", "ANULADA", "RECHAZADA"],
      transition_condition_type: ["ON_SUCCESS", "ON_FAILURE", "ON_DENIAL"],
      transition_trigger_type: [
        "ON_ALL_SUCCESS",
        "ON_VALIDATION_FAILURE",
        "ON_VALIDATION_DENIAL",
        "ON_INPUT_RECEIVED",
      ],
    },
  },
} as const
