CREATE EXTENSION IF NOT EXISTS unaccent;
ALTER TABLE vehicles ADD COLUMN search_text text NOT NULL DEFAULT '';
CREATE FUNCTION update_vehicle_search() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.search_text:=regexp_replace(translate(lower(unaccent(concat_ws(' ',NEW.make,NEW.model,NEW.generation,NEW.market,NEW.engine,NEW.fuel,NEW.transmission,NEW.body,NEW.equipment,NEW.aliases::text))),'أإآى','اااي'),'[^[:alnum:]]','','g');
 RETURN NEW; END $$;
CREATE TRIGGER vehicle_search_update BEFORE INSERT OR UPDATE OF make,model,generation,market,engine,fuel,transmission,body,equipment,aliases ON vehicles FOR EACH ROW EXECUTE FUNCTION update_vehicle_search();
UPDATE vehicles SET aliases=aliases;
CREATE INDEX vehicles_search_trgm ON vehicles USING gin(search_text gin_trgm_ops);
