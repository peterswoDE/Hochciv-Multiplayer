// Every change of a users row – by the app, a raw query or by hand – is announced on the channel
// `hochciv_user_changed` (payload: the id): the server's user cache (utils/session-cost.js) drops
// that user at once, also on other instances.
exports.up = async db => {
    await db.query(`CREATE OR REPLACE FUNCTION hochciv_user_changed() RETURNS trigger LANGUAGE plpgsql AS $fn$
        BEGIN
            PERFORM pg_notify('hochciv_user_changed', (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text);
            RETURN NULL;
        END $fn$`);
    await db.query('DROP TRIGGER IF EXISTS users_changed ON users');
    await db.query('CREATE TRIGGER users_changed AFTER UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION hochciv_user_changed()');
};
