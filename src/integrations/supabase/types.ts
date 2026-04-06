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
    PostgrestVersion: "14.4"
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
      aplicacoes: {
        Row: {
          aprovacao_necessaria: boolean
          created_at: string
          criticidade: Database["public"]["Enums"]["criticidade"]
          default_app_role_id: string
          entra_id: string | null
          id: string
          integracao_ativa: boolean
          nome: string
          owner: string | null
          tipo_auth: string | null
          updated_at: string
        }
        Insert: {
          aprovacao_necessaria?: boolean
          created_at?: string
          criticidade?: Database["public"]["Enums"]["criticidade"]
          default_app_role_id?: string
          entra_id?: string | null
          id?: string
          integracao_ativa?: boolean
          nome: string
          owner?: string | null
          tipo_auth?: string | null
          updated_at?: string
        }
        Update: {
          aprovacao_necessaria?: boolean
          created_at?: string
          criticidade?: Database["public"]["Enums"]["criticidade"]
          default_app_role_id?: string
          entra_id?: string | null
          id?: string
          integracao_ativa?: boolean
          nome?: string
          owner?: string | null
          tipo_auth?: string | null
          updated_at?: string
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
          colaborador_id: string
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          id: string
          import_job_id: string
          motivo: string
          status: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          import_job_id: string
          motivo?: string
          status?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          import_job_id?: string
          motivo?: string
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
      colab_snapshots: {
        Row: {
          created_at: string
          dados: Json
          hash: string
          id: string
          import_job_id: string
          matricula: string
        }
        Insert: {
          created_at?: string
          dados: Json
          hash: string
          id?: string
          import_job_id: string
          matricula: string
        }
        Update: {
          created_at?: string
          dados?: Json
          hash?: string
          id?: string
          import_job_id?: string
          matricula?: string
        }
        Relationships: [
          {
            foreignKeyName: "colab_snapshots_import_job_id_fkey"
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
          updated_at: string
        }
        Insert: {
          descricao?: string | null
          entra_id: string
          id?: string
          nome: string
          on_premises_sync?: boolean
          updated_at?: string
        }
        Update: {
          descricao?: string | null
          entra_id?: string
          id?: string
          nome?: string
          on_premises_sync?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      entra_licencas: {
        Row: {
          em_uso: number
          id: string
          nome: string
          sku_id: string
          total: number
          updated_at: string
        }
        Insert: {
          em_uso?: number
          id?: string
          nome: string
          sku_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          em_uso?: number
          id?: string
          nome?: string
          sku_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      evento_jml_acoes: {
        Row: {
          aplicacao: string | null
          created_at: string
          descricao: string
          evento_id: string
          executado_em: string | null
          id: string
          status: string
        }
        Insert: {
          aplicacao?: string | null
          created_at?: string
          descricao: string
          evento_id: string
          executado_em?: string | null
          id?: string
          status?: string
        }
        Update: {
          aplicacao?: string | null
          created_at?: string
          descricao?: string
          evento_id?: string
          executado_em?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_jml_acoes_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos_jml"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_jml_aprovacoes: {
        Row: {
          aprovador: string | null
          comentario: string | null
          created_at: string
          data_decisao: string | null
          etapa: number
          evento_id: string
          id: string
          status: string
        }
        Insert: {
          aprovador?: string | null
          comentario?: string | null
          created_at?: string
          data_decisao?: string | null
          etapa?: number
          evento_id: string
          id?: string
          status?: string
        }
        Update: {
          aprovador?: string | null
          comentario?: string | null
          created_at?: string
          data_decisao?: string | null
          etapa?: number
          evento_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_jml_aprovacoes_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos_jml"
            referencedColumns: ["id"]
          },
        ]
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
      iam_queue: {
        Row: {
          action_type: string
          colaborador_id: string | null
          correlation_id: string
          created_at: string
          error_code: string | null
          id: string
          max_retries: number
          next_retry_at: string | null
          payload_json: Json
          processed_at: string | null
          processed_by: string | null
          requested_by: string | null
          result_message: string | null
          retry_count: number
          status: string
          target_identity: string | null
        }
        Insert: {
          action_type: string
          colaborador_id?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          payload_json: Json
          processed_at?: string | null
          processed_by?: string | null
          requested_by?: string | null
          result_message?: string | null
          retry_count?: number
          status?: string
          target_identity?: string | null
        }
        Update: {
          action_type?: string
          colaborador_id?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          payload_json?: Json
          processed_at?: string | null
          processed_by?: string | null
          requested_by?: string | null
          result_message?: string | null
          retry_count?: number
          status?: string
          target_identity?: string | null
        }
        Relationships: []
      }
      licencas: {
        Row: {
          aplicacao_id: string | null
          created_at: string
          custo_unitario: number | null
          em_uso: number
          id: string
          nome: string
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
      operadores: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id?: string
          nome: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      perfil_atribuicoes: {
        Row: {
          ativo: boolean
          colaborador_id: string | null
          created_at: string
          data_concessao: string
          data_revogacao: string | null
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
      perfil_composicao: {
        Row: {
          created_at: string
          detalhe: string | null
          id: string
          nome: string
          perfil_id: string
          tipo: string
        }
        Insert: {
          created_at?: string
          detalhe?: string | null
          id?: string
          nome: string
          perfil_id: string
          tipo: string
        }
        Update: {
          created_at?: string
          detalhe?: string | null
          id?: string
          nome?: string
          perfil_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_composicao_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
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
          created_at: string | null
          email: string
          id: string
          nome: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          email: string
          id: string
          nome: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          email?: string
          id?: string
          nome?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      regra_condicoes: {
        Row: {
          campo: string
          id: string
          operador: string
          ordem: number
          regra_id: string
          valor: string
        }
        Insert: {
          campo: string
          id?: string
          operador: string
          ordem?: number
          regra_id: string
          valor: string
        }
        Update: {
          campo?: string
          id?: string
          operador?: string
          ordem?: number
          regra_id?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "regra_condicoes_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "regras"
            referencedColumns: ["id"]
          },
        ]
      }
      regra_resultados: {
        Row: {
          detalhe: string | null
          id: string
          ordem: number
          perfil_id: string | null
          regra_id: string
          tipo: string
        }
        Insert: {
          detalhe?: string | null
          id?: string
          ordem?: number
          perfil_id?: string | null
          regra_id: string
          tipo: string
        }
        Update: {
          detalhe?: string | null
          id?: string
          ordem?: number
          perfil_id?: string | null
          regra_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "regra_resultados_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regra_resultados_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "regras"
            referencedColumns: ["id"]
          },
        ]
      }
      regras: {
        Row: {
          atualizado_por: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          prioridade: number
          status: Database["public"]["Enums"]["status_regra"]
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          prioridade?: number
          status?: Database["public"]["Enums"]["status_regra"]
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          prioridade?: number
          status?: Database["public"]["Enums"]["status_regra"]
          updated_at?: string
        }
        Relationships: []
      }
      revisao_itens: {
        Row: {
          colaborador_id: string | null
          colaborador_nome: string | null
          created_at: string
          decidido_em: string | null
          decisao: string | null
          id: string
          justificativa: string | null
          perfil_id: string | null
          perfil_nome: string | null
          revisao_id: string
        }
        Insert: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          decidido_em?: string | null
          decisao?: string | null
          id?: string
          justificativa?: string | null
          perfil_id?: string | null
          perfil_nome?: string | null
          revisao_id: string
        }
        Update: {
          colaborador_id?: string | null
          colaborador_nome?: string | null
          created_at?: string
          decidido_em?: string | null
          decisao?: string | null
          id?: string
          justificativa?: string | null
          perfil_id?: string | null
          perfil_nome?: string | null
          revisao_id?: string
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
        ]
      }
      revisoes: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          itens_revisados: number
          nome: string
          responsavel: string | null
          status: Database["public"]["Enums"]["status_revisao"]
          total_itens: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          itens_revisados?: number
          nome: string
          responsavel?: string | null
          status?: Database["public"]["Enums"]["status_revisao"]
          total_itens?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          itens_revisados?: number
          nome?: string
          responsavel?: string | null
          status?: Database["public"]["Enums"]["status_revisao"]
          total_itens?: number
          updated_at?: string
        }
        Relationships: []
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
          updated_at?: string
        }
        Relationships: []
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "operador" | "viewer"
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
      status_regra: "ativa" | "inativa" | "rascunho"
      status_revisao: "em_andamento" | "concluida" | "cancelada"
      tipo_evento_jml: "joiner" | "mover" | "leaver"
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
      app_role: ["admin", "operador", "viewer"],
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
      status_regra: ["ativa", "inativa", "rascunho"],
      status_revisao: ["em_andamento", "concluida", "cancelada"],
      tipo_evento_jml: ["joiner", "mover", "leaver"],
      tipo_perfil: ["funcional", "tecnico", "privilegiado"],
    },
  },
} as const
