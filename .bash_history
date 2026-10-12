        .list-card { background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .toggle-switch { display: flex; justify-content: space-between; align-items: center; padding: 15px; background: white; border-bottom: 1px solid #eee; }
        .toggle-switch input[type="checkbox"] { width: 40px; height: 20px; accent-color: var(--color-primario); }
        /* === MENÚ INFERIOR === */
        .bottom-nav { position: fixed; bottom: 0; left: 0; width: 100%; background: white; display: flex; justify-content: space-around; padding: 10px 0; padding-bottom: env(safe-area-inset-bottom, 10px); box-shadow: 0 -2px 10px rgba(0,0,0,0.05); z-index: 1000; }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 5px; color: var(--color-gris); font-size: 0.7rem; cursor: pointer; width: 20%; }
        .nav-item.active { color: var(--color-primario); }
        .nav-item i { font-size: 1.3rem; transition: transform 0.2s; }
    </style>
</head>
<body>
    <-m CABECERA -->
    <header class="header">
        <div class="logo-text">NeX</div>
        <div class="search-container">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input type="text" placeholder="Buscar en NeX...">
        </div>
        <div class="header-icon" onclick="abrirSubPantalla('Notificações', 'notificacoes')"><i class="fa-regular fa-bell"></i></div>
    </header>
    <-m VISTA 1: INICIO -->
    <div id="view-home" class="view">
        <div class="quick-actions">
            <div class="action-item" onclick="abrirSubPantalla('Ofertas do Dia', 'ofertas')"><div class="action-icon"><i class="fa-solid fa-tag"></i></div><span class="action-text">Ofertas</span></div>
            <div class="action-item" onclick="abrirSubPantalla('Cupons', 'cupons')"><div class="action-icon"><i class="fa-solid fa-ticket"></i></div><span class="action-text">Cupons</span></div>
            <div class="action-item" onclick="abrirSubPantalla('Celulares', 'celulares')"><div class="action-icon"><i class="fa-solid fa-mobile-screen"></i></div><span class="action-text">Celulares</span></div>
            <div class="action-item" onclick="abrirSubPantalla('Ferramentas', 'taller')"><div class="action-icon"><i class="fa-solid fa-toolbox"></i></div><span class="action-text">Taller</span></div>
        </div>
        <div class="banner">
            <div class="banner-info"><h2>Especial Tech</h2><p>Equipe seu negócio</p></div>
            <i class="fa-solid fa-bolt" style="font-size: 2.5rem; opacity: 0.8;"></i>
        </div>
        <div class="products-grid">
            <div class="product-card">
                <div class="product-img-placeholder"><i class="fa-solid fa-bolt"></i></div>
                <div class="product-price">R$ 299.90</div>
                <div class="product-shipping">Chega grátis amanhã</div>
                <div class="product-title">Multímetro Digital Profissional</div>
            </div>
            <div class="product-card">
                <div class="product-img-placeholder"><i class="fa-solid fa-temperature-arrow-up"></i></div>
                <div class="product-price">R$ 450.00</div>
                <div class="product-shipping">Frete grátis</div>
                <div class="product-title">Estação de Retrabalho</div>
            </div>
        </div>
    </div>
    <-m VISTA 2: CARRITO -->
    <div id="view-cart" class="view hidden">
        <div class="screen-header">Meu Carrinho</div>
        <div class="cart-item">
            <input type="checkbox" class="cart-checkbox" checked onchange="calcularTotal()">
            <div class="cart-img"><i class="fa-solid fa-mobile"></i></div>
            <div class="cart-details">
                <div class="cart-title">Máquina Separadora Lcd</div>
                <div class="cart-item-price" data-price="380.50">R$ 380.50</div>
            </div>
            <button class="btn-delete" onclick="eliminarProducto(this)"><i class="fa-solid fa-trash"></i></button>
        </div>
        <div class="checkout-bar" id="checkout-bar-element">
            <div>
                <div style="font-size: 0.8rem; color: var(--color-gris);">Total a pagar</div>
                <div class="checkout-total" id="total-price">R$ 0.00</div>
            </div>
            <button class="btn-buy" onclick="abrirSubPantalla('Finalizar Compra', 'checkout')">Comprar</button>
        </div>
    </div>
    <-m VISTA 3: MÁS (Menú Principal Ajustes) -->
    <div id="view-more" class="view hidden">
        <div class="profile-header">
            <div class="profile-info" onclick="abrirSubPantalla('Meu Perfil', 'perfil')">
                <div class="profile-avatar"><i class="fa-solid fa-user"></i></div>
                <div class="profile-text">
                    <h2>Usuário NeX</h2>
                    <p>Meu perfil <i class="fa-solid fa-chevron-right" style="font-size: 0.7rem;"></i></p>
                </div>
            </div>
        </div>
        <div class="promo-cards">
            <div class="promo-card promo-meli" onclick="abrirSubPantalla('NeX+', 'assinaturas')">
                <span>NeX+ Assine com até 67% OFF</span><i class="fa-solid fa-chevron-right"></i>
            </div>
            <div class="promo-card promo-pago" onclick="abrirSubPantalla('NeX Pago', 'pagos')">
                <span><i class="fa-solid fa-handshake" style="color:#009ee3;"></i> NeX Pago</span><i class="fa-solid fa-chevron-right" style="color:var(--color-gris);"></i>
            </div>
        </div>
        <div class="menu-section" style="border-top:none;">
            <div class="menu-item" onclick="abrirSubPantalla('Cupons Relâmpago', 'cupons')">
                <i class="fa-solid fa-ticket menu-icon"></i><span class="menu-text">Cupons Relâmpago</span><span class="tag tag-green">RESGATE</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Meus Pontos', 'pontos')">
                <i class="fa-regular fa-star menu-icon"></i><span class="menu-text">Pontos</span><span class="tag tag-green">JOGUE E GANHE</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Central de Ajuda', 'ajuda')">
                <i class="fa-solid fa-headset menu-icon"></i><span class="menu-text">Ajuda</span>
            </div>
        </div>
        <div class="menu-section">
            <div class="menu-title">Minha atividade</div>
            <div class="menu-item" onclick="abrirSubPantalla('Minhas Compras', 'compras')">
                <i class="fa-solid fa-bag-shopping menu-icon"></i><span class="menu-text">Minhas compras</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Notificações', 'notificacoes')">
                <i class="fa-regular fa-bell menu-icon"></i><span class="menu-text">Notificações</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Favoritos', 'favoritos')">
                <i class="fa-regular fa-heart menu-icon"></i><span class="menu-text">Favoritos</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Lojas que Sigo', 'lojas')">
                <i class="fa-solid fa-store menu-icon"></i><span class="menu-text">Lojas que sigo</span><span class="tag tag-blue">NOVO</span>
            </div>
        </div>
        <div class="menu-section">
            <div class="menu-title">Descubra</div>
            <div class="menu-item" onclick="abrirSubPantalla('Central de Afiliados', 'afiliados')">
                <i class="fa-solid fa-link menu-icon"></i><span class="menu-text">Central de afiliados e criadores</span><span class="tag tag-green">GANHE $</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Seguros', 'seguros')">
                <i class="fa-solid fa-shield-halved menu-icon"></i><span class="menu-text">Seguros e assistências</span><span class="tag tag-blue">NOVO</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Para seu Negócio', 'negocio')">
                <i class="fa-solid fa-store menu-icon"></i><span class="menu-text">Para seu negócio</span><span class="tag tag-blue">NOVO</span>
            </div>
        </div>
        <-m Opciones exclusivas (Para administradores/vendedores) -->
        <div class="menu-section">
            <div class="menu-title">Vender no NeX</div>
            <div class="menu-item" onclick="abrirSubPantalla('Publicar Produto', 'vender')">
                <i class="fa-solid fa-tag menu-icon"></i><span class="menu-text">Vender</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Painel de Vendedor', 'central-vendedores')">
                <i class="fa-solid fa-shop menu-icon"></i><span class="menu-text">Central de vendedores</span>
            </div>
            <div class="menu-item" onclick="abrirSubPantalla('Faturamento', 'faturamento')">
                <i class="fa-solid fa-file-invoice-dollar menu-icon"></i><span class="menu-text">Faturamento</span>
            </div>
        </div>
        
        <div class="menu-section">
            <div class="menu-item" onclick="abrirSubPantalla('Configurações', 'configuracoes')">
                <i class="fa-solid fa-gear menu-icon"></i><span class="menu-text">Configurações</span>
            </div>
        </div>
    </div>
    <-m CONTENEDOR DE PANTALLAS DESLIZABLES (Aquí ocurre la magia) -->
    <div id="sub-screen-container">
        <div class="sub-header">
            <i class="fa-solid fa-arrow-left" onclick="cerrarSubPantalla()"></i>
            <h2 id="sub-title">Título</h2>
        </div>
        <div id="sub-content">
            <-m El contenido se inyecta aquí con JavaScript -->
        </div>
    </div>
    <-m BARRA DE NAVEGACIÓN INFERIOR -->
    <nav class="bottom-nav">
        <div class="nav-item active" onclick="cambiarVista(this, 'view-home')">
            <i class="fa-solid fa-house"></i><span>Início</span>
        </div>
        <div class="nav-item" onclick="abrirSubPantalla('Categorias', 'categorias')">
            <i class="fa-solid fa-border-all"></i><span>Categorias</span>
        </div>
        <div class="nav-item" onclick="cambiarVista(this, 'view-cart')">
            <i class="fa-solid fa-cart-shopping"></i><span>Carrinho</span>
        </div>
        <div class="nav-item" onclick="cambiarVista(this, 'view-more')">
            <i class="fa-solid fa-bars"></i><span>Mais</span>
        </div>
    </nav>
    <-m LOGICA JAVASCRIPT -->
    <script>
        // Cambiar vistas principales (Inicio, Carrito, Menú)
        function cambiarVista(elementoNav, idVista) {
            document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
            elementoNav.classList.add('active');
            document.querySelectorAll('.view').forEach(vista => vista.classList.add('hidden'));
            document.getElementById(idVista).classList.remove('hidden');
            const checkoutBar = document.getElementById('checkout-bar-element');
            if(idVista === 'view-cart') {
                checkoutBar.classList.remove('hidden');
                calcularTotal();
            } else {
                checkoutBar.classList.add('hidden');
            }
        }
        function calcularTotal() {             let total = 0;             document.querySelectorAll('.cart-item').forEach(producto => {
                const checkbox = producto.querySelector('.cart-checkbox');
                if (checkbox.checked) {
                    total += parseFloat(producto.querySelector('.cart-item-price').getAttribute('data-price'));
                }
            });
            document.getElementById('total-price').innerText = 'R$ ' + total.toFixed(2);
        }
        function eliminarProducto(boton) {
            boton.closest('.cart-item').remove();
            calcularTotal();
        }
        // ========================================================
        // MOTOR DE SUB-PANTALLAS DINÁMICAS (Funcionalidad Real)
        // ========================================================
        function abrirSubPantalla(titulo, idPantalla) {
            document.getElementById('sub-title').innerText = titulo;
            const content = document.getElementById('sub-content');
            let htmlGenerado = '';
            // Lógica según el botón presionado
            switch(idPantalla) {
                
                case 'vender':                     htmlGenerado = `
                        <div style="background:white; padding:20px; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                            <h3 style="margin-bottom:15px; color:var(--color-texto);">O que você quer vender?</h3>
                            <label style="font-size:0.8rem; font-weight:bold; color:var(--color-gris);">Nome do Produto</label>
                            <input type="text" class="form-input" placeholder="Ex: Multímetro, Película, Cabo...">
                            
                            <label style="font-size:0.8rem; font-weight:bold; color:var(--color-gris);">Preço (R$)</label>
                            <input type="number" class="form-input" placeholder="0.00">
                            
                            <label style="font-size:0.8rem; font-weight:bold; color:var(--color-gris);">Estoque disponível</label>
                            <input type="number" class="form-input" placeholder="Quantidade">
                        </div>
                    `;
                    break;

                case 'compras':
                    htmlGenerado = `
                        <div class="list-card">
                            <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:10px;">
                                <span style="font-weight:bold; color:var(--color-verde);">Entregue em 10/10/2026</span>
                            </div>
                            <div style="display:flex; gap:15px; align-items:center;">
                                <div style="width:50px; height:50px; background:#f3f4f6; border-radius:5px; display:flex; justify-content:center; align-items:center; font-size:1.5rem; color:var(--color-primario);"><i class="fa-solid fa-box"></i></div>
                                <div>
                                    <h4 style="font-size:0.9rem;">Kit Chaves de Precisão para Celular</h4>
                                    <p style="font-size:0.8rem; color:var(--color-gris);">Enviado para o seu endereço</p>
                                </div>
                            </div>
                            <button style="width:100%; margin-top:15px; padding:8px; background:white; border:1px solid var(--color-primario); color:var(--color-primario); border-radius:5px; font-weight:bold; cursor:pointer;">Comprar novamente</button>
                        </div>
                    `;
                    break;

                case 'cupons':
                    htmlGenerado = `
                        <div style="display:flex; gap:10px; margin-bottom:20px;">
                            <input type="text" class="form-input" style="margin-bottom:0;" placeholder="Inserir código do cupom">
                            <button class="btn-primary" style="width:auto; padding:0 20px;">Aplicar</button>
                        </div>
                        <h4 style="margin-bottom:10px; color:var(--color-gris);">Meus Cupons Ativos</h4>
                        <div class="list-card" style="border-left: 5px solid var(--color-verde);">
                            <h3 style="color:var(--color-texto);">10% OFF em Ferramentas</h3>
                            <p style="font-size:0.8rem; color:var(--color-gris); margin-top:5px;">Válido até amanhã. Aplicável em carrinhos acima de R$100.</p>
                        </div>
                    `;
                    break;

                case 'configuracoes':
                    htmlGenerado = `
                        <div class="toggle-switch">
                            <div>
                                <h4 style="font-size:1rem;">Notificações Push</h4>
                                <p style="font-size:0.8rem; color:var(--color-gris);">Receba alertas de compras e envios.</p>
                            </div>
                            <input type="checkbox" checked>
                        </div>
                        <div class="toggle-switch">
                            <div>
                                <h4 style="font-size:1rem;">Modo Escuro (Dark Mode)</h4>
                                <p style="font-size:0.8rem; color:var(--color-gris);">Economize bateria e proteja os olhos.</p>
                            </div>
                            <input type="checkbox" onclick="alert('Função em desenvolvimento.')">
                        </div>
                        <div class="toggle-switch">
                            <div>
                                <h4 style="font-size:1rem; color:var(--color-rojo);">Encerrar Sessão</h4>
                            </div>
                            <button style="background:none; border:none; color:var(--color-rojo); font-size:1.2rem; cursor:pointer;"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
                        </div>
                    `;
                    break;

                case 'notificacoes':
                    htmlGenerado = `
                        <div class="list-card" style="display:flex; gap:15px; align-items:flex-start;">
                            <div style="color:var(--color-verde); font-size:1.5rem;"><i class="fa-solid fa-circle-check"></i></div>
                            <div>
                                <p style="font-size:0.8rem; color:var(--color-gris); margin-top:3px;">Sua compra do cabo USB-C foi confirmada e já está sendo embalada.</p>
                                <span style="font-size:0.7rem; color:var(--color-gris); margin-top:5px; display:block;">Há 2 horas</span>
                            </div>
                        </div>
                    `;
                    break;
                
                case 'afiliados':
                    htmlGenerado = `
                        <div style="background:linear-gradient(135deg, #10b981, #059669); color:white; padding:20px; border-radius:10px; margin-bottom:20px; text-align:center;">
                            <h3 style="font-weight:normal; font-size:1rem;">Ganhos deste mês</h3>
                            <h1 style="font-size:2.5rem; margin:10px 0;">R$ 154,30</h1>
                            <button style="background:white; color:#059669; border:none; padding:8px 20px; border-radius:20px; font-weight:bold; cursor:pointer;">Sacar dinheiro</button>
                        </div>
                        <h4 style="margin-bottom:10px; color:var(--color-gris);">Seu Link de Parceiro</h4>
                        <div style="display:flex; background:white; border-radius:8px; overflow:hidden; border:1px solid #ddd;">
                            <input type="text" value="https://nexshopping.com/ref/usuario123" readonly style="flex:1; border:none; padding:12px; background:#f9fafb; color:var(--color-gris);">
                        </div>
                    `;
                    break;
                    
                case 'central-vendedores':
                    // Panel de administrador
                    htmlGenerado = `
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
                            <div style="background:white; padding:15px; border-radius:8px; border-left:4px solid var(--color-primario); box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                                <span style="font-size:0.8rem; color:var(--color-gris);">Vendas Hoje</span>
                                <h2 style="color:var(--color-texto);">12</h2>
                            </div>
                            <div style="background:white; padding:15px; border-radius:8px; border-left:4px solid var(--color-verde); box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                                <span style="font-size:0.8rem; color:var(--color-gris);">Visitas</span>
                                <h2 style="color:var(--color-texto);">345</h2>
                            </div>
                        </div>
                        <h3 style="margin-bottom:10px;">Meus Produtos Ativos</h3>
                        <div class="list-card" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>Estação de Calor (Estoque: 5)</span>
                            <i class="fa-solid fa-pen-to-square" style="color:var(--color-primario); cursor:pointer;"></i>
                        </div>
                    `;
                    break;

                // Para cualquier otro botón que no hayamos detallado arriba, cargamos una plantilla por defecto funcional.
                default:
                    htmlGenerado = `
                        <div style="text-align:center; padding:40px 20px;">
                            <i class="fa-solid fa-gear" style="font-size:4rem; color:#cbd5e1; margin-bottom:15px;"></i>
                            <h3 style="color:var(--color-texto); margin-bottom:10px;">Módulo: ${titulo}</h3>
                            <p style="color:var(--color-gris); font-size:0.9rem;">O sistema de banco de dados para esta seção está sincronizando. Você poderá interagir aqui em breve.</p>
                            <button class="btn-primary" style="margin-top:20px; width:auto; padding:10px 30px;" onclick="cerrarSubPantalla()">Voltar</button>
                        </div>
                    `;
                    break;
            }

            // Inyectamos el HTML dinámico y deslizamos la pantalla
            content.innerHTML = htmlGenerado;
            document.getElementById('sub-screen-container').classList.add('active');
        }

        // Función para cerrar la pantalla lateral
        function cerrarSubPantalla() {
            document.getElementById('sub-screen-container').classList.remove('active');
        }

        // Ocultar barra al inicio
        document.getElementById('checkout-bar-element').classList.add('hidden');
    </script>
</body>
</html>





git push origin-shop master:main
clear





















git push origin-shop master:main
git push origin-shop master:main
git pull origin-shop main --allow-unrelated-histories
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>NeX shopping</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    
    <style>
        :root {
            --color-primario: #1e40af; --color-fondo: #f3f4f6; --color-texto: #1f2937;
            --color-gris: #6b7280; --color-rojo: #ef4444; --color-verde: #10b981;
            --color-whatsapp: #25D366; --color-azul-claro: #3b82f6; --color-rosa: #ec4899;
            --color-admin: #000000;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
        body { background-color: var(--color-fondo); padding-top: 65px; padding-bottom: 70px; overflow-x: hidden; }
        /* === HEADER === */
        .header { position: fixed; top: 0; left: 0; width: 100%; background-color: var(--color-primario); padding: 12px 15px; display: flex; align-items: center; gap: 15px; z-index: 1000; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .logo-text { color: white; font-weight: 800; font-size: 1.2rem; }
        .search-container { flex: 1; background-color: white; border-radius: 20px; padding: 8px 15px; display: flex; align-items: center; gap: 10px; }
        .search-container input { border: none; outline: none; width: 100%; font-size: 0.95rem; background: transparent;}
        .header-icon { color: white; font-size: 1.2rem; cursor: pointer;}
        /* === VISTAS COMUNES === */
        .screen-header { padding: 20px; font-size: 1.5rem; font-weight: bold; background: white; border-bottom: 1px solid #ddd; }
        .screen-content { padding: 20px; text-align: center; color: var(--color-gris); }
        /* === INICIO & PRODUCTOS === */
        .quick-actions { display: flex; overflow-x: auto; padding: 20px 15px; gap: 20px; background: white; scrollbar-width: none; }
        .quick-actions::-webkit-scrollbar { display: none; }
        .action-item { display: flex; flex-direction: column; align-items: center; min-width: 65px; gap: 8px; cursor: pointer;}
        .action-icon { width: 48px; height: 48px; background-color: #eff6ff; color: var(--color-primario); border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 1.2rem; }
        .action-text { font-size: 0.75rem; font-weight: 500; text-align: center; }
        
        .products-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 0 15px 20px 15px; margin-top: 15px;}
        .product-card { background: white; border-radius: 8px; padding: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative;}
        .product-img-placeholder { width: 100%; aspect-ratio: 1; background-color: #f8fafc; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: center; align-items: center; color: #cbd5e1; font-size: 2.5rem; position: relative; }
        
        .discount-badge { position: absolute; top: 5px; left: 5px; background: var(--color-rojo); color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; }
        .old-price { text-decoration: line-through; color: var(--color-gris); font-size: 0.8rem; margin-bottom: -3px; display: block; }
        .product-price { font-size: 1.2rem; font-weight: bold; }
        .product-shipping { font-size: 0.7rem; color: var(--color-verde); font-weight: 600; margin: 4px 0; }
git add index.html
git commit -m "Conflictos de fusión resueltos en index.html"
git push origin-shop
git push origin shop master:main
git push origin-shop master:main
git add .
git commit -m "anex"
git push origin-shop master:main
git add .
ls
git remmote set-url origin https://github.com/lesterkendry-arch/NeXshopping.git
git remmote set-url origin https://github.com/les
git remote set-url origin https://github.com/lesterkendry-arch/NeXshopping.git
git push origin master:main
git init
pwd
cd/Nex
nex
git add .
git commit -m "problema"
git push
git remote -v
git remote set-url origin https://github.com/lesterkendry-arch/Nexk-token.git
git remote -v
git add.
git add .
git commit -m "solucion"
git push 
git add .
git commit -m "prueva1"
git push origin-shop master
git init
cd
cd Documents/NeX
ls
cd /sdcard/Documents/NeX
git init
git add index.html
git config --global --add safe.directory /sdcard/Documents/NeX
git commit -m "otraves"
git add .
git commit -m "problema"
git status
ls
git add index.html
git commi -m "pinga"
git commit -m "pinga"
ls -ld
mkdir -p .git/objects
git add .
git commit -m "pajaro"
git add .
git commit -m "klv"
git push origin-shop
git add .
git commit -m "bamos"
git push origin-shop
git add .
git commit -m "ayyy"
git add .
git add .
git commit -m "priebaall"
git add .
git commit -m "all"
git push origin-shop
git add .
dit commit -m "pinga"
git commit -m "pinga"
git push origin-shop
git add .
git commit -m "paraya"
git push origin-shop
git add .
git commit -m "prueba"
git push origin-shop
git add .
git status
