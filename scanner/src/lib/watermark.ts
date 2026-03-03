import { supabase } from '../config';

export interface Watermark {
  lastProcessedAt: string | null;
  lastProcessedId: string | null;
}

export async function getWatermark(companyId: string, sourceTable: string): Promise<Watermark> {
  const { data } = await supabase
    .schema('app')
    .from('processing_watermarks')
    .select('last_processed_at, last_processed_id')
    .eq('company_id', companyId)
    .eq('source_table', sourceTable)
    .single();

  return {
    lastProcessedAt: data?.last_processed_at ?? null,
    lastProcessedId: data?.last_processed_id ?? null,
  };
}

export async function updateWatermark(
  companyId: string,
  sourceTable: string,
  lastProcessedAt: string,
  lastProcessedId: string
): Promise<void> {
  const { error } = await supabase
    .schema('app')
    .from('processing_watermarks')
    .upsert(
      {
        company_id: companyId,
        source_table: sourceTable,
        last_processed_at: lastProcessedAt,
        last_processed_id: lastProcessedId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,source_table' }
    );

  if (error) {
    console.error(`[Watermark] Failed to update for ${companyId}/${sourceTable}:`, error.message);
  }
}
