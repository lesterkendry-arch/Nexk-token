<?php
// Permitir que tu página lea este archivo
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); 

// La URL de CJ Dropshipping y tu clave privada
$url = "https://api.cjdropshipping.com/api/product/list";
$api_key = "CJ5921371@api@666d4fdecce94d33af10e864a753086a"; // Tu clave está 100% oculta aquí

// Iniciar la conexión (cURL)
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Access-Token: ' . $api_key
]);

// Ejecutar, obtener la respuesta y cerrar
$response = curl_exec($ch);
curl_close($ch);

// Entregar el catálogo a tu página web
echo $response;
?>
