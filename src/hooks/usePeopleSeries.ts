import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parsePeopleSeries } from '@/lib/peopleActivity';
export function usePeopleSeries(days: number) {
  return useQuery({
    queryKey: ['dashboard_people_series', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_people_series', { p_days: days });
      if (error) throw error;
      return parsePeopleSeries(data);
    },
    refetchInterval: 60000,
  });
}
