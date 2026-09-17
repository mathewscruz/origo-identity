export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alertas: {
        Row: {
          created_at: string
          data: string
          id: string
          lido: boolean
          mensagem: string | null
          ref_id: string | null
          ref_tipo: string | null
          ref_url: string | null
          severidade: Database["public"]["Enums"]["severidade_alerta"]
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          lido?: boolean
          mensagem?: string | null
          ref_id?: string | null
          ref_tipo?: string | null
          ref_url?: string | null
          severidade?: Database["public"]["Enums"]["severidade_alerta"]
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          lido?: boolean
          mensagem?: string | null
          ref_id?: string | null
          ref_tipo?: string | null
          ref_url?: string | null
          severidade?: Database["public"]["Enums"]["severidade_alerta"]
          tipo?: string
          titulo?: string
        }
        Relationships: []
      }
      aplicacao_connectors: {
        Row: {
          aplicacao_id: string
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          aplicacao_id: string
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          aplicacao_id?: string
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicacao_connectors_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: true
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicacao_perfis_internos: {
        Row: {
          aplicacao_id: string
          ativo: boolean
          created_at: string
          descricao: string | null
          external_id: string | null
          id: string
          nome_externo: string
        }
        Insert: {
          aplicacao_id: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          external_id?: string | null
          id?: string
          nome_externo: string
        }
        Update: {
          aplicacao_id?: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          external_id?: string | null
          id?: string
          nome_externo?: string
        }
        Relationships: [
          {
            foreignKeyName: "aplicacao_perfis_internos_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicacoes: {
        Row: {
          aprovacao_necessaria: boolean
          connector_type: string
          created_at: string
          criticidade: Database["public"]["Enums"]["criticidade"]
          default_app_role_id: string
          entra_id: string | null
          id: string
          integracao_ativa: boolean
          nome: string
          origem: string
          owner: string | null
          tipo_auth: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          aprovacao_necessaria?: boolean
          connector_type?: string
          created_at?: string
          criticidade?: Database["public"]["Enums"]["criticidade"]
          default_app_role_id?: string
          entra_id?: string | null
          id?: string
          integracao_ativa?: boolean
          nome: string
          origem?: string
          owner?: string | null
          tipo_auth?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          aprovacao_necessaria?: boolean
          connector_type?: string
          created_at?: string
          criticidade?: Database["public"]["Enums"]["criticidade"]
          default_app_role_id?: string
          entra_id?: string | null
          id?: string
          integracao_ativa?: boolean
          nome?: string
          origem?: string
          owner?: string | null
          tipo_auth?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      areas: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          acao: string
          created_at: string
          detalhes: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          ip: string | null
          operador: string | null
          resumo: string | null
          timestamp: string
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          ip?: string | null
          operador?: string | null
          resumo?: string | null
          timestamp?: string
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          ip?: string | null
          operador?: string | null
          resumo?: string | null
          timestamp?: string
        }
        Relationships: []
      }
      backup_cargo_perfis_20260708: {
        Row: {
          backup_created_at: string
          cargo_id: string | null
          created_at: string | null
          id: string | null
          perfil_id: string | null
        }
        Insert: {
          backup_created_at?: string
          cargo_id?: string | null
          created_at?: string | null
          id?: string | null
          perfil_id?: string | null
        }
        Update: {
          backup_created_at?: string
          cargo_id?: string | null
          created_at?: string | null
          id?: string | null
          perfil_id?: string | null
        }
        Relationships: []
      }
      backup_cargo_perfis_regex_fix_20260708: {
        Row: {
          backup_created_at: string
          cargo_id: string | null
          created_at: string | null
          id: string | null
          perfil_id: string | null
        }
        Insert: {
          backup_created_at?: string
          cargo_id?: string | null
          created_at?: string | null
          id?: string | null
          perfil_id?: string | null
        }
        Update: {
          backup_created_at?: string
          cargo_id?: string | null
          created_at?: string | null
          id?: string | null
          perfil_id?: string | null
        }
        Relationships: []
      }
      backup_colaboradores_restore_20260707: {
        Row: {
          area_id: string | null
          cargo_id: string | null
          cpf: string | null
          created_at: string | null
          data_admissao: string | null
          data_desligamento: string | null
          desligado_manual: boolean | null
          desligado_manual_em: string | null
          desligado_manual_por: string | null
          email: string | null
          empresa_id: string | null
          entra_id: string | null
          gestor_id: string | null
          id: string | null
          import_hash: string | null
          localidade_id: string | null
          matricula: string | null
          nome: string | null
          origem: string | null
          sam_account_name: string | null
          status: Database["public"]["Enums"]["status_colaborador"] | null
          suspenso_em: string | null
          suspenso_motivo: string | null
          suspenso_por: string | null
          suspenso_preventivo: boolean | null
          ultima_importacao_id: string | null
          updated_at: string | null
        }
        Insert: {
          area_id?: string | null
          cargo_id?: string | null
          cpf?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          desligado_manual?: boolean | null
          desligado_manual_em?: string | null
          desligado_manual_por?: string | null
          email?: string | null
          empresa_id?: string | null
          entra_id?: string | null
          gestor_id?: string | null
          id?: string | null
          import_hash?: string | null
          localidade_id?: string | null
          matricula?: string | null
          nome?: string | null
          origem?: string | null
          sam_account_name?: string | null
          status?: Database["public"]["Enums"]["status_colaborador"] | null
          suspenso_em?: string | null
          suspenso_motivo?: string | null
          suspenso_por?: string | null
          suspenso_preventivo?: boolean | null
          ultima_importacao_id?: string | null
          updated_at?: string | null
        }
        Update: {
          area_id?: string | null
          cargo_id?: string | null
          cpf?: string | null
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          desligado_manual?: boolean | null
          desligado_manual_em?: string | null
          desligado_manual_por?: string | null
          email?: string | null
          empresa_id?: string | null
          entra_id?: string | null
          gestor_id?: string | null
          id?: string | null
          import_hash?: string | null
          localidade_id?: string | null
          matricula?: string | null
          nome?: string | null
          origem?: string | null
          sam_account_name?: string | null
          status?: Database["public"]["Enums"]["status_colaborador"] | null
          suspenso_em?: string | null
          suspenso_motivo?: string | null
          suspenso_por?: string | null
          suspenso_preventivo?: boolean | null
          ultima_importacao_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      backup_perfil_atribuicoes_20260708: {
        Row: {
          ativo: boolean | null
          backup_created_at: string
          colaborador_id: string | null
          created_at: string | null
          data_concessao: string | null
          data_revogacao: string | null
          excecao_id: string | null
          id: string | null
          origem: string | null
          perfil_id: string | null
          terceiro_id: string | null
        }
        Insert: {
          ativo?: boolean | null
          backup_created_at?: string
          colaborador_id?: string | null
          created_at?: string | null
          data_concessao?: string | null
          data_revogacao?: string | null
          excecao_id?: string | null
          id?: string | null
          origem?: string | null
          perfil_id?: string | null
          terceiro_id?: string | null
        }
        Update: {
          ativo?: boolean | null
          backup_created_at?: string
          colaborador_id?: string | null
          created_at?: string | null
          data_concessao?: string | null
          data_revogacao?: string | null
          excecao_id?: string | null
          id?: string | null
          origem?: string | null
          perfil_id?: string | null
          terceiro_id?: string | null
        }
        Relationships: []
      }
      backup_perfil_licencas_20260708: {
        Row: {
          backup_created_at: string
          id: string | null
          licenca_id: string | null
          perfil_id: string | null
        }
        Insert: {
          backup_created_at?: string
          id?: string | null
          licenca_id?: string | null
          perfil_id?: string | null
        }
        Update: {
          backup_created_at?: string
          id?: string | null
          licenca_id?: string | null
          perfil_id?: string | null
        }
        Relationships: []
      }
      cargo_perfis: {
        Row: {
          cargo_id: string
          created_at: string
          id: string
          perfil_id: string
        }
        Insert: {
          cargo_id: string
          created_at?: string
          id?: string
          perfil_id: string
        }
        Update: {
          cargo_id?: string
          created_at?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargo_perfis_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargo_perfis_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          area_id: string | null
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      colab_quarentena: {
        Row: {
          colaborador_id: string | null
          created_at: string
          dados: Json | null
          decidido_em: string | null
          decidido_por: string | null
          detalhe: string | null
          email: string | null
          id: string
          import_job_id: string
          matricula: string | null
          motivo: string
          nome: string | null
          status: string
        }
        Insert: {
          colaborador_id?: string | null
          created_at?: string
          dados?: Json | null
          decidido_em?: string | null
          decidido_por?: string | null
          detalhe?: string | null
          email?: string | null
          id?: string
          import_job_id: string
          matricula?: string | null
          motivo?: string
          nome?: string | null
          status?: string
        }
        Update: {
          colaborador_id?: string | null
          created_at?: string
          dados?: Json | null
          decidido_em?: string | null
          decidido_por?: string | null
          detalhe?: string | null
          email?: string | null
          id?: string
          import_job_id?: string
          matricula?: string | null
          motivo?: string
          nome?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "colab_quarentena_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colab_quarentena_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          area_id: string | null
          cargo_id: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          desligado_manual: boolean
          desligado_manual_em: string | null
          desligado_manual_por: string | null
          email: string | null
          empresa_id: string | null
          entra_id: string | null
          gestor_id: string | null
          id: string
          import_hash: string | null
          localidade_id: string | null
          matricula: string | null
          nome: string
          origem: string | null
          sam_account_name: string | null
          status: Database["public"]["Enums"]["status_colaborador"]
          suspenso_em: string | null
          suspenso_motivo: string | null
          suspenso_por: string | null
          suspenso_preventivo: boolean
          ultima_importacao_id: string | null
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          cargo_id?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          desligado_manual?: boolean
          desligado_manual_em?: string | null
          desligado_manual_por?: string | null
          email?: string | null
          empresa_id?: string | null
          entra_id?: string | null
          gestor_id?: string | null
          id?: string
          import_hash?: string | null
          localidade_id?: string | null
          matricula?: string | null
          nome: string
          origem?: string | null
          sam_account_name?: string | null
          status?: Database["public"]["Enums"]["status_colaborador"]
          suspenso_em?: string | null
          suspenso_motivo?: string | null
          suspenso_por?: string | null
          suspenso_preventivo?: boolean
          ultima_importacao_id?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          cargo_id?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          desligado_manual?: boolean
          desligado_manual_em?: string | null
          desligado_manual_por?: string | null
          email?: string | null
          empresa_id?: string | null
          entra_id?: string | null
          gestor_id?: string | null
          id?: string
          import_hash?: string | null
          localidade_id?: string | null
          matricula?: string | null
          nome?: string
          origem?: string | null
          sam_account_name?: string | null
          status?: Database["public"]["Enums"]["status_colaborador"]
          suspenso_em?: string | null
          suspenso_motivo?: string | null
          suspenso_por?: string | null
          suspenso_preventivo?: boolean
          ultima_importacao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_localidade_id_fkey"
            columns: ["localidade_id"]
            isOneToOne: false
            referencedRelation: "localidades"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_admin_conhecidas: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          dono_responsavel: string | null
          email: string | null
          entra_id: string
          id: string
          motivo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          dono_responsavel?: string | null
          email?: string | null
          entra_id: string
          id?: string
          motivo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          dono_responsavel?: string | null
          email?: string | null
          entra_id?: string
          id?: string
          motivo?: string
          updated_at?: string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          ativo: boolean
          cnpj: string | null
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      entra_grupos: {
        Row: {
          descricao: string | null
          entra_id: string
          id: string
          nome: string
          on_premises_sync: boolean
          owner: string | null
          updated_at: string
        }
        Insert: {
          descricao?: string | null
          entra_id: string
          id?: string
          nome: string
          on_premises_sync?: boolean
          owner?: string | null
          updated_at?: string
        }
        Update: {
          descricao?: string | null
          entra_id?: string
          id?: string
          nome?: string
          on_premises_sync?: boolean
          owner?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      entra_licencas: {
        Row: {
          capability_status: string | null
          em_uso: number
          friendly_name: string | null
          id: string
          is_trial: boolean
          nome: string
          sku_id: string
          total: number
          updated_at: string
        }
        Insert: {
          capability_status?: string | null
          em_uso?: number
          friendly_name?: string | null
          id?: string
          is_trial?: boolean
          nome: string
          sku_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          capability_status?: string | null
          em_uso?: number
          friendly_name?: string | null
          id?: string
          is_trial?: boolean
          nome?: string
          sku_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      entra_role_members: {
        Row: {
          assignment_type: string
          colaborador_id: string | null
          directory_scope_id: string | null
          end_at: string | null
          id: string
          role_id: string
          start_at: string | null
          updated_at: string
          user_display_name: string | null
          user_email: string | null
          user_entra_id: string
        }
        Insert: {
          assignment_type?: string
          colaborador_id?: string | null
          directory_scope_id?: string | null
          end_at?: string | null
          id?: string
          role_id: string
          start_at?: string | null
          updated_at?: string
          user_display_name?: string | null
          user_email?: string | null
          user_entra_id: string
        }
        Update: {
          assignment_type?: string
          colaborador_id?: string | null
          directory_scope_id?: string | null
          end_at?: string | null
          id?: string
          role_id?: string
          start_at?: string | null
          updated_at?: string
          user_display_name?: string | null
          user_email?: string | null
          user_entra_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entra_role_members_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entra_role_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "entra_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      entra_roles: {
        Row: {
          descricao: string | null
          id: string
          is_built_in: boolean
          is_privileged: boolean
          nome: string
          role_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          descricao?: string | null
          id?: string
          is_built_in?: boolean
          is_privileged?: boolean
          nome: string
          role_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          descricao?: string | null
          id?: string
          is_built_in?: boolean
          is_privileged?: boolean
          nome?: string
          role_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      eventos_jml: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string | null
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          erro_mensagem: string | null
          id: string
          max_tentativas: number
          origem: string | null
          status: Database["public"]["Enums"]["status_evento_jml"]
          tentativas: number
          terceiro_id: string | null
          tipo: Database["public"]["Enums"]["tipo_evento_jml"]
          updated_at: string
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          erro_mensagem?: string | null
          id?: string
          max_tentativas?: number
          origem?: string | null
          status?: Database["public"]["Enums"]["status_evento_jml"]
          tentativas?: number
          terceiro_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_evento_jml"]
          updated_at?: string
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          erro_mensagem?: string | null
          id?: string
          max_tentativas?: number
          origem?: string | null
          status?: Database["public"]["Enums"]["status_evento_jml"]
          tentativas?: number
          terceiro_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_evento_jml"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_jml_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_jml_terceiro_id_fkey"
            columns: ["terceiro_id"]
            isOneToOne: false
            referencedRelation: "terceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      excecoes: {
        Row: {
          aprovador: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          created_at: string
          data_decisao: string | null
          id: string
          justificativa: string
          perfil_id: string | null
          perfil_solicitado: string | null
          solicitante: string
          status: Database["public"]["Enums"]["status_excecao"]
          tipo_excecao: string
          updated_at: string
          validade: string | null
        }
        Insert: {
          aprovador?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          data_decisao?: string | null
          id?: string
          justificativa: string
          perfil_id?: string | null
          perfil_solicitado?: string | null
          solicitante: string
          status?: Database["public"]["Enums"]["status_excecao"]
          tipo_excecao?: string
          updated_at?: string
          validade?: string | null
        }
        Update: {
          aprovador?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          data_decisao?: string | null
          id?: string
          justificativa?: string
          perfil_id?: string | null
          perfil_solicitado?: string | null
          solicitante?: string
          status?: Database["public"]["Enums"]["status_excecao"]
          tipo_excecao?: string
          updated_at?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "excecoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excecoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      iam_agent_status: {
        Row: {
          details: Json
          execute_mode: boolean | null
          host: string | null
          last_claim_at: string | null
          last_result: string | null
          last_result_at: string | null
          last_seen_at: string
          owner: string
          version: string | null
        }
        Insert: {
          details?: Json
          execute_mode?: boolean | null
          host?: string | null
          last_claim_at?: string | null
          last_result?: string | null
          last_result_at?: string | null
          last_seen_at?: string
          owner: string
          version?: string | null
        }
        Update: {
          details?: Json
          execute_mode?: boolean | null
          host?: string | null
          last_claim_at?: string | null
          last_result?: string | null
          last_result_at?: string | null
          last_seen_at?: string
          owner?: string
          version?: string | null
        }
        Relationships: []
      }
      iam_queue: {
        Row: {
          action_type: string
          approved_at: string | null
          approved_by: string | null
          claim_attempts: number
          claim_owner: string | null
          claim_token: string | null
          claimed_at: string | null
          colaborador_id: string | null
          correlation_id: string
          created_at: string
          error_code: string | null
          id: string
          lease_expires_at: string | null
          max_retries: number
          next_retry_at: string | null
          payload_json: Json
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          requested_by: string | null
          resource_key: string | null
          result_message: string | null
          retry_count: number
          status: string
          target_identity: string | null
          terceiro_id: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          approved_by?: string | null
          claim_attempts?: number
          claim_owner?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          colaborador_id?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          lease_expires_at?: string | null
          max_retries?: number
          next_retry_at?: string | null
          payload_json: Json
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          resource_key?: string | null
          result_message?: string | null
          retry_count?: number
          status?: string
          target_identity?: string | null
          terceiro_id?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          approved_by?: string | null
          claim_attempts?: number
          claim_owner?: string | null
          claim_token?: string | null
          claimed_at?: string | null
          colaborador_id?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          lease_expires_at?: string | null
          max_retries?: number
          next_retry_at?: string | null
          payload_json?: Json
          processed_at?: string | null
          processed_by?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          resource_key?: string | null
          result_message?: string | null
          retry_count?: number
          status?: string
          target_identity?: string | null
          terceiro_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iam_queue_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iam_queue_terceiro_id_fkey"
            columns: ["terceiro_id"]
            isOneToOne: false
            referencedRelation: "terceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      licencas: {
        Row: {
          aplicacao_id: string | null
          created_at: string
          custo_unitario: number | null
          em_uso: number
          id: string
          nome: string
          owner: string | null
          renovacao: string | null
          tipo: string | null
          total: number
          updated_at: string
        }
        Insert: {
          aplicacao_id?: string | null
          created_at?: string
          custo_unitario?: number | null
          em_uso?: number
          id?: string
          nome: string
          owner?: string | null
          renovacao?: string | null
          tipo?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          aplicacao_id?: string | null
          created_at?: string
          custo_unitario?: number | null
          em_uso?: number
          id?: string
          nome?: string
          owner?: string | null
          renovacao?: string | null
          tipo?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licencas_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      localidades: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "localidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      perfil_aplicacoes: {
        Row: {
          aplicacao_id: string
          created_at: string
          id: string
          perfil_id: string
        }
        Insert: {
          aplicacao_id: string
          created_at?: string
          id?: string
          perfil_id: string
        }
        Update: {
          aplicacao_id?: string
          created_at?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_aplicacoes_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_aplicacoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_apps_internos: {
        Row: {
          aplicacao_id: string
          created_at: string
          id: string
          perfil_id: string
          perfil_interno_id: string
        }
        Insert: {
          aplicacao_id: string
          created_at?: string
          id?: string
          perfil_id: string
          perfil_interno_id: string
        }
        Update: {
          aplicacao_id?: string
          created_at?: string
          id?: string
          perfil_id?: string
          perfil_interno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_apps_internos_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_apps_internos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_apps_internos_perfil_interno_id_fkey"
            columns: ["perfil_interno_id"]
            isOneToOne: false
            referencedRelation: "aplicacao_perfis_internos"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_atribuicoes: {
        Row: {
          ativo: boolean
          colaborador_id: string | null
          created_at: string
          data_concessao: string
          data_revogacao: string | null
          excecao_id: string | null
          id: string
          origem: string | null
          perfil_id: string
          terceiro_id: string | null
        }
        Insert: {
          ativo?: boolean
          colaborador_id?: string | null
          created_at?: string
          data_concessao?: string
          data_revogacao?: string | null
          excecao_id?: string | null
          id?: string
          origem?: string | null
          perfil_id: string
          terceiro_id?: string | null
        }
        Update: {
          ativo?: boolean
          colaborador_id?: string | null
          created_at?: string
          data_concessao?: string
          data_revogacao?: string | null
          excecao_id?: string | null
          id?: string
          origem?: string | null
          perfil_id?: string
          terceiro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfil_atribuicoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_atribuicoes_excecao_id_fkey"
            columns: ["excecao_id"]
            isOneToOne: false
            referencedRelation: "excecoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_atribuicoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_atribuicoes_terceiro_id_fkey"
            columns: ["terceiro_id"]
            isOneToOne: false
            referencedRelation: "terceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_grupos: {
        Row: {
          grupo_id: string
          id: string
          perfil_id: string
        }
        Insert: {
          grupo_id: string
          id?: string
          perfil_id: string
        }
        Update: {
          grupo_id?: string
          id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_grupos_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "entra_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_grupos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_licencas: {
        Row: {
          id: string
          licenca_id: string
          perfil_id: string
        }
        Insert: {
          id?: string
          licenca_id: string
          perfil_id: string
        }
        Update: {
          id?: string
          licenca_id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_licencas_licenca_id_fkey"
            columns: ["licenca_id"]
            isOneToOne: false
            referencedRelation: "entra_licencas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_licencas_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_sharepoint: {
        Row: {
          created_at: string
          id: string
          pasta_nivel1_id: string | null
          pasta_nivel2_id: string | null
          perfil_id: string
          permissao: string
          site_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pasta_nivel1_id?: string | null
          pasta_nivel2_id?: string | null
          perfil_id: string
          permissao?: string
          site_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pasta_nivel1_id?: string | null
          pasta_nivel2_id?: string | null
          perfil_id?: string
          permissao?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_sharepoint_pasta_nivel1_id_fkey"
            columns: ["pasta_nivel1_id"]
            isOneToOne: false
            referencedRelation: "sharepoint_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_sharepoint_pasta_nivel2_id_fkey"
            columns: ["pasta_nivel2_id"]
            isOneToOne: false
            referencedRelation: "sharepoint_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_sharepoint_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_sharepoint_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sharepoint_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_acesso: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          tipo: Database["public"]["Enums"]["tipo_perfil"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          tipo?: Database["public"]["Enums"]["tipo_perfil"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          tipo?: Database["public"]["Enums"]["tipo_perfil"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ativo: boolean
          avatar_url: string | null
          created_at: string | null
          email: string
          id: string
          must_change_password: boolean
          nome: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string | null
          email: string
          id: string
          must_change_password?: boolean
          nome: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          must_change_password?: boolean
          nome?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      revisao_itens: {
        Row: {
          area_nome: string | null
          cargo_nome: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          decisao: string | null
          executado_em: string | null
          id: string
          justificativa: string | null
          origem: string | null
          perfil_id: string | null
          perfil_nome: string | null
          recurso_nome: string | null
          resource_key: string | null
          revisao_id: string
          terceiro_id: string | null
          tipo: string
        }
        Insert: {
          area_nome?: string | null
          cargo_nome?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          decisao?: string | null
          executado_em?: string | null
          id?: string
          justificativa?: string | null
          origem?: string | null
          perfil_id?: string | null
          perfil_nome?: string | null
          recurso_nome?: string | null
          resource_key?: string | null
          revisao_id: string
          terceiro_id?: string | null
          tipo?: string
        }
        Update: {
          area_nome?: string | null
          cargo_nome?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          decisao?: string | null
          executado_em?: string | null
          id?: string
          justificativa?: string | null
          origem?: string | null
          perfil_id?: string | null
          perfil_nome?: string | null
          recurso_nome?: string | null
          resource_key?: string | null
          revisao_id?: string
          terceiro_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisao_itens_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisao_itens_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisao_itens_revisao_id_fkey"
            columns: ["revisao_id"]
            isOneToOne: false
            referencedRelation: "revisoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisao_itens_terceiro_id_fkey"
            columns: ["terceiro_id"]
            isOneToOne: false
            referencedRelation: "terceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      revisoes: {
        Row: {
          aplicacao_id: string | null
          concluida_em: string | null
          concluida_por: string | null
          created_at: string
          criada_por: string | null
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          gestor_id: string | null
          id: string
          itens_revisados: number
          lembrete_enviado_em: string | null
          nome: string
          owner_email: string | null
          responsavel: string | null
          resultado: Json | null
          status: Database["public"]["Enums"]["status_revisao"]
          tipo: string | null
          token: string | null
          token_expires_at: string | null
          total_itens: number
          updated_at: string
        }
        Insert: {
          aplicacao_id?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criada_por?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          gestor_id?: string | null
          id?: string
          itens_revisados?: number
          lembrete_enviado_em?: string | null
          nome: string
          owner_email?: string | null
          responsavel?: string | null
          resultado?: Json | null
          status?: Database["public"]["Enums"]["status_revisao"]
          tipo?: string | null
          token?: string | null
          token_expires_at?: string | null
          total_itens?: number
          updated_at?: string
        }
        Update: {
          aplicacao_id?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criada_por?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          gestor_id?: string | null
          id?: string
          itens_revisados?: number
          lembrete_enviado_em?: string | null
          nome?: string
          owner_email?: string | null
          responsavel?: string | null
          resultado?: Json | null
          status?: Database["public"]["Enums"]["status_revisao"]
          tipo?: string | null
          token?: string | null
          token_expires_at?: string | null
          total_itens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revisoes_aplicacao_id_fkey"
            columns: ["aplicacao_id"]
            isOneToOne: false
            referencedRelation: "aplicacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revisoes_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      sharepoint_pastas: {
        Row: {
          caminho: string | null
          created_at: string
          drive_item_id: string | null
          id: string
          nome: string
          parent_id: string | null
          site_db_id: string
        }
        Insert: {
          caminho?: string | null
          created_at?: string
          drive_item_id?: string | null
          id?: string
          nome: string
          parent_id?: string | null
          site_db_id: string
        }
        Update: {
          caminho?: string | null
          created_at?: string
          drive_item_id?: string | null
          id?: string
          nome?: string
          parent_id?: string | null
          site_db_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sharepoint_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "sharepoint_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sharepoint_pastas_site_db_id_fkey"
            columns: ["site_db_id"]
            isOneToOne: false
            referencedRelation: "sharepoint_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sharepoint_sites: {
        Row: {
          created_at: string
          id: string
          nome: string
          site_id: string
          url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          site_id: string
          url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          site_id?: string
          url?: string | null
        }
        Relationships: []
      }
      sod_conflitos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          perfil_a_id: string
          perfil_b_id: string
          severidade: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          perfil_a_id: string
          perfil_b_id: string
          severidade?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          perfil_a_id?: string
          perfil_b_id?: string
          severidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "sod_conflitos_perfil_a_fkey"
            columns: ["perfil_a_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sod_conflitos_perfil_b_fkey"
            columns: ["perfil_b_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          apps_created: number | null
          apps_percent: number | null
          apps_total: number | null
          apps_updated: number | null
          colab_created: number | null
          colab_inativos: number | null
          colab_percent: number | null
          colab_quarentena: number | null
          colab_total: number | null
          colab_updated: number | null
          created_at: string | null
          error: string | null
          filename: string | null
          id: string
          message: string | null
          phase: string | null
          status: string
          tipo: string
          updated_at: string | null
          users_created: number | null
          users_percent: number | null
          users_total: number | null
          users_updated: number | null
        }
        Insert: {
          apps_created?: number | null
          apps_percent?: number | null
          apps_total?: number | null
          apps_updated?: number | null
          colab_created?: number | null
          colab_inativos?: number | null
          colab_percent?: number | null
          colab_quarentena?: number | null
          colab_total?: number | null
          colab_updated?: number | null
          created_at?: string | null
          error?: string | null
          filename?: string | null
          id?: string
          message?: string | null
          phase?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
          users_created?: number | null
          users_percent?: number | null
          users_total?: number | null
          users_updated?: number | null
        }
        Update: {
          apps_created?: number | null
          apps_percent?: number | null
          apps_total?: number | null
          apps_updated?: number | null
          colab_created?: number | null
          colab_inativos?: number | null
          colab_percent?: number | null
          colab_quarentena?: number | null
          colab_total?: number | null
          colab_updated?: number | null
          created_at?: string | null
          error?: string | null
          filename?: string | null
          id?: string
          message?: string | null
          phase?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
          users_created?: number | null
          users_percent?: number | null
          users_total?: number | null
          users_updated?: number | null
        }
        Relationships: []
      }
      terceiros: {
        Row: {
          ativo: boolean
          contrato_fim: string | null
          contrato_inicio: string | null
          created_at: string
          criticidade: Database["public"]["Enums"]["criticidade"]
          email: string | null
          empresa_terceira: string | null
          id: string
          nome: string
          responsavel: string | null
          responsavel_colaborador_id: string | null
          sam_account_name: string | null
          ultima_revalidacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          contrato_fim?: string | null
          contrato_inicio?: string | null
          created_at?: string
          criticidade?: Database["public"]["Enums"]["criticidade"]
          email?: string | null
          empresa_terceira?: string | null
          id?: string
          nome: string
          responsavel?: string | null
          responsavel_colaborador_id?: string | null
          sam_account_name?: string | null
          ultima_revalidacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          contrato_fim?: string | null
          contrato_inicio?: string | null
          created_at?: string
          criticidade?: Database["public"]["Enums"]["criticidade"]
          email?: string | null
          empresa_terceira?: string | null
          id?: string
          nome?: string
          responsavel?: string | null
          responsavel_colaborador_id?: string | null
          sam_account_name?: string | null
          ultima_revalidacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terceiros_responsavel_colaborador_id_fkey"
            columns: ["responsavel_colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      licencas_externas_uso: {
        Row: {
          em_uso_calc: number | null
          licenca_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_exec_ddl: {
        Args: { p_description?: string; p_sql: string }
        Returns: string
      }
      admin_exec_sql: { Args: { p_sql: string }; Returns: Json }
      admin_purge_colaboradores: {
        Args: { p_ids: string[]; p_motivo: string }
        Returns: number
      }
      admin_usuarios_resumo: { Args: never; Returns: Json }
      alertas_marcar_lidos: { Args: { p_ids?: string[] }; Returns: number }
      apply_reconcile_updates: {
        Args: { colab_updates?: Json; queue_updates?: Json }
        Returns: Json
      }
      audit_operador: { Args: never; Returns: string }
      claim_iam_queue_items: {
        Args: {
          p_action_types?: string[]
          p_lease_seconds?: number
          p_limit?: number
          p_owner: string
        }
        Returns: {
          action_type: string
          approved_at: string | null
          approved_by: string | null
          claim_attempts: number
          claim_owner: string | null
          claim_token: string | null
          claimed_at: string | null
          colaborador_id: string | null
          correlation_id: string
          created_at: string
          error_code: string | null
          id: string
          lease_expires_at: string | null
          max_retries: number
          next_retry_at: string | null
          payload_json: Json
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          requested_by: string | null
          resource_key: string | null
          result_message: string | null
          retry_count: number
          status: string
          target_identity: string | null
          terceiro_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "iam_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      colaborador_salvar: {
        Args: { p_dados: Json; p_id: string; p_operador?: string }
        Returns: Json
      }
      complete_iam_queue_item: {
        Args: {
          p_claim_token: string
          p_error_code?: string
          p_id: string
          p_next_retry_at?: string
          p_processed_by?: string
          p_result_message?: string
          p_retry_count?: number
          p_status: string
          p_target_identity?: string
        }
        Returns: {
          action_type: string
          approved_at: string | null
          approved_by: string | null
          claim_attempts: number
          claim_owner: string | null
          claim_token: string | null
          claimed_at: string | null
          colaborador_id: string | null
          correlation_id: string
          created_at: string
          error_code: string | null
          id: string
          lease_expires_at: string | null
          max_retries: number
          next_retry_at: string | null
          payload_json: Json
          processed_at: string | null
          processed_by: string | null
          rejection_reason: string | null
          requested_by: string | null
          resource_key: string | null
          result_message: string | null
          retry_count: number
          status: string
          target_identity: string | null
          terceiro_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "iam_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dashboard_activity: {
        Args: {
          p_categoria?: string
          p_colaborador_id?: string
          p_limit?: number
          p_terceiro_id?: string
        }
        Returns: Json
      }
      dashboard_metrics: { Args: never; Returns: Json }
      dashboard_series: { Args: { p_days?: number }; Returns: Json }
      excecao_decidir: {
        Args: { p_comentario?: string; p_decisao: string; p_id: string }
        Returns: Json
      }
      get_revisao_by_token: { Args: { p_token: string }; Returns: Json }
      get_revisao_itens_by_token: { Args: { p_token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hermes_inbox: { Args: never; Returns: Json }
      iam_active_perfil_ids: {
        Args: {
          p_colaborador_id: string
          p_exclude?: string[]
          p_terceiro_id: string
        }
        Returns: string[]
      }
      iam_agent_heartbeat: {
        Args: { p_details?: Json; p_kind: string; p_owner: string }
        Returns: undefined
      }
      iam_assert_operator: { Args: never; Returns: undefined }
      iam_cron_invoke: {
        Args: { p_body?: Json; p_function: string }
        Returns: number
      }
      iam_effective_access: {
        Args: { p_colaborador_id?: string; p_terceiro_id?: string }
        Returns: {
          origem: string
          payload: Json
          perfil_id: string
          resource_key: string
          tipo: string
        }[]
      }
      iam_enqueue_individual_removals: {
        Args: {
          p_colaborador_id: string
          p_requested_by: string
          p_status?: string
          p_terceiro_id: string
        }
        Returns: Json
      }
      iam_enqueue_profile_actions: {
        Args: {
          p_colaborador_id: string
          p_mode: string
          p_motivo?: string
          p_perfil_ids: string[]
          p_requested_by: string
          p_status?: string
          p_terceiro_id: string
        }
        Returns: number
      }
      iam_enqueue_reset_password: {
        Args: {
          p_colaborador_id?: string
          p_motivo?: string
          p_terceiro_id?: string
        }
        Returns: Json
      }
      iam_enqueue_resource_diff: {
        Args: {
          p_added?: Json
          p_check_individual?: boolean
          p_colaborador_id: string
          p_exclude_perfil_ids?: string[]
          p_motivo?: string
          p_removed?: Json
          p_requested_by?: string
          p_status?: string
          p_terceiro_id: string
        }
        Returns: number
      }
      iam_identity: {
        Args: { p_colaborador_id: string; p_terceiro_id: string }
        Returns: Json
      }
      iam_individual_resources: {
        Args: { p_colaborador_id: string; p_terceiro_id: string }
        Returns: {
          action_assign: string
          action_remove: string
          payload: Json
          requested_by: string
          resource_key: string
          target_identity: string
        }[]
      }
      iam_param: {
        Args: { p_chave: string; p_default?: string }
        Returns: string
      }
      iam_profile_resources: {
        Args: { p_perfil_ids: string[] }
        Returns: {
          action_assign: string
          action_remove: string
          payload: Json
          perfil_id: string
          resource_key: string
          tipo: string
        }[]
      }
      iam_queue_decidir: {
        Args: { p_decisao: string; p_ids: string[]; p_motivo?: string }
        Returns: Json
      }
      iam_queue_distinct_actions_origins: {
        Args: { status_filter: string[] }
        Returns: {
          action_type: string
          requested_by: string
        }[]
      }
      iam_queue_insert: {
        Args: {
          p_action: string
          p_extra?: Json
          p_identity: Json
          p_payload: Json
          p_requested_by: string
          p_resource_key: string
          p_status?: string
        }
        Returns: boolean
      }
      iam_queue_reprocessar: { Args: { p_ids: string[] }; Returns: number }
      iam_queue_reprocessar_falhas: {
        Args: { p_action_types?: string[] }
        Returns: number
      }
      iam_queue_resource_key: {
        Args: { p_action: string; p_payload: Json; p_resource_key: string }
        Returns: string
      }
      iam_queue_stats: { Args: never; Returns: Json }
      iam_resolve_email: { Args: { p_text: string }; Returns: string }
      iam_resource_template: {
        Args: {
          p_pasta_id?: string
          p_perfil_interno_id?: string
          p_permissao?: string
          p_ref_id: string
          p_tipo: string
        }
        Returns: {
          action_assign: string
          action_remove: string
          payload: Json
          resource_key: string
          tipo: string
        }[]
      }
      iam_revogar_individual: {
        Args: {
          p_colaborador_id: string
          p_motivo?: string
          p_resource_key: string
          p_terceiro_id: string
        }
        Returns: Json
      }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      jml_alterar_cargo: {
        Args: {
          p_atualizar_colaborador?: boolean
          p_cargo_anterior_id?: string
          p_colaborador_id: string
          p_novo_cargo_id: string
          p_operador: string
          p_origem?: string
        }
        Returns: Json
      }
      jml_alterar_status: {
        Args: {
          p_colaborador_id: string
          p_motivo?: string
          p_novo_status: string
          p_operador: string
          p_origem?: string
          p_skip_status_update?: boolean
        }
        Returns: Json
      }
      jml_pre_leaver: {
        Args: { p_colaborador_id: string; p_motivo: string; p_operador: string }
        Returns: Json
      }
      jml_pre_leaver_reverter: {
        Args: { p_colaborador_id: string; p_motivo: string; p_operador: string }
        Returns: Json
      }
      jml_provisionar_cargo: {
        Args: {
          p_cargo_id: string
          p_colaborador_id: string
          p_requested_by: string
          p_status?: string
        }
        Returns: Json
      }
      quarentena_decidir: {
        Args: { p_id: string; p_observacao?: string; p_status: string }
        Returns: Json
      }
      revisao_cancelar: {
        Args: { p_motivo?: string; p_revisao_id: string }
        Returns: Json
      }
      revisao_concluir: {
        Args: {
          p_decidido_por?: string
          p_revisao_id: string
          p_sem_decisao?: string
        }
        Returns: Json
      }
      revisao_criar: {
        Args: {
          p_aplicacao_id?: string
          p_data_fim?: string
          p_gestor_id?: string
          p_nome?: string
          p_operador?: string
          p_responsavel?: string
          p_tipo: string
        }
        Returns: Json
      }
      revisao_criar_por_gestores: {
        Args: { p_data_fim?: string; p_operador?: string }
        Returns: Json
      }
      revisao_criar_por_responsaveis: {
        Args: {
          p_data_fim?: string
          p_operador?: string
          p_somente_vencidos?: boolean
        }
        Returns: Json
      }
      revisao_decidir_itens: {
        Args: {
          p_decidido_por?: string
          p_decisoes: Json
          p_justificativas?: Json
          p_revisao_id: string
        }
        Returns: Json
      }
      terceiro_alterar_status: {
        Args: {
          p_ativo: boolean
          p_motivo?: string
          p_operador: string
          p_origem?: string
          p_terceiro_id: string
        }
        Returns: Json
      }
      terceiro_revalidar: {
        Args: {
          p_motivo?: string
          p_novo_contrato_fim?: string
          p_terceiro_id: string
        }
        Returns: Json
      }
      terceiro_salvar: {
        Args: { p_dados: Json; p_id: string; p_operador?: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "operador" | "viewer" | "platform_admin"
      criticidade: "baixa" | "media" | "alta" | "critica"
      sensibilidade_perfil: "baixa" | "media" | "alta" | "critica"
      severidade_alerta: "info" | "aviso" | "critico"
      status_colaborador:
        | "ativo"
        | "inativo"
        | "ferias"
        | "afastado"
        | "desligado"
      status_evento_jml:
        | "pendente"
        | "quarentena"
        | "executando"
        | "executado"
        | "erro"
        | "cancelado"
      status_excecao: "pendente" | "aprovada" | "rejeitada" | "expirada"
      status_revisao: "em_andamento" | "concluida" | "cancelada"
      tipo_evento_jml:
        | "joiner"
        | "mover"
        | "leaver"
        | "pre_leaver"
        | "pre_leaver_revertido"
      tipo_perfil: "funcional" | "tecnico" | "privilegiado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "operador", "viewer", "platform_admin"],
      criticidade: ["baixa", "media", "alta", "critica"],
      sensibilidade_perfil: ["baixa", "media", "alta", "critica"],
      severidade_alerta: ["info", "aviso", "critico"],
      status_colaborador: [
        "ativo",
        "inativo",
        "ferias",
        "afastado",
        "desligado",
      ],
      status_evento_jml: [
        "pendente",
        "quarentena",
        "executando",
        "executado",
        "erro",
        "cancelado",
      ],
      status_excecao: ["pendente", "aprovada", "rejeitada", "expirada"],
      status_revisao: ["em_andamento", "concluida", "cancelada"],
      tipo_evento_jml: [
        "joiner",
        "mover",
        "leaver",
        "pre_leaver",
        "pre_leaver_revertido",
      ],
      tipo_perfil: ["funcional", "tecnico", "privilegiado"],
    },
  },
} as const

