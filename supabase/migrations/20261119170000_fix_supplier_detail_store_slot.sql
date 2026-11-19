-- delivery_base must select store_slot_id; prior patch only added it to jsonb output.
do $$
declare
  def text;
begin
  def := pg_get_functiondef('public.supplier_detail_bundle(uuid,uuid,uuid)'::regprocedure);

  if position(E'd.store_id,\n      d.delivery_date,' in def) > 0
     and position(E'd.store_id,\n      d.store_slot_id,\n      d.delivery_date,' in def) = 0 then
    def := replace(
      def,
      E'd.store_id,\n      d.delivery_date,',
      E'd.store_id,\n      d.store_slot_id,\n      d.delivery_date,'
    );
  elsif position('d.store_id, d.delivery_date,' in def) > 0
     and position('d.store_id, d.store_slot_id, d.delivery_date,' in def) = 0 then
    def := replace(
      def,
      'd.store_id, d.delivery_date,',
      'd.store_id, d.store_slot_id, d.delivery_date,'
    );
  end if;

  execute def;
end $$;
