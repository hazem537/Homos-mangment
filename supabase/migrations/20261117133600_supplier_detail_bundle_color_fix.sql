-- Ensure supplier_detail_bundle uses suppliers.color (not dropped notes).
do $fix$
declare
  def text;
  before_count int;
  after_count int;
begin
  def := pg_get_functiondef('public.supplier_detail_bundle(uuid,uuid,uuid)'::regprocedure);
  before_count := (length(def) - length(replace(def, 's.notes,', ''))) / length('s.notes,');

  if before_count = 0 and position('s.color,' in def) > 0 then
    return;
  end if;

  def := replace(
    def,
    E'            s.name,\n            s.notes,\n            s.is_active,',
    E'            s.name,\n            s.color,\n            s.is_active,'
  );
  def := replace(
    def,
    E'      s.name,\n      s.notes,\n      s.is_active,',
    E'      s.name,\n      s.color,\n      s.is_active,'
  );
  def := replace(def, 's.notes,', 's.color,');

  after_count := (length(def) - length(replace(def, 's.notes,', ''))) / length('s.notes,');
  if position('s.color,' in def) = 0 then
    raise exception 'supplier_detail_bundle color patch failed: s.color missing (had % s.notes before)', before_count;
  end if;
  if after_count > 0 then
    raise exception 'supplier_detail_bundle color patch failed: % s.notes remain', after_count;
  end if;

  execute def;
end
$fix$;
