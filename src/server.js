const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Serveur lancé sur http://0.0.0.0:${PORT}`);
});

start();
