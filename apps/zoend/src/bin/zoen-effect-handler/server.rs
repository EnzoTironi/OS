//! Cleartext HTTP/2 server exposing the Restate endpoint plus the baked
//! artifact identity document.
//!
//! `GET /zoen/artifact` answers the registrar identity probe; every other
//! path is handled by the Restate endpoint (including its `/health`).

use std::{convert::Infallible, error::Error, fmt, future::Future, net::SocketAddr, pin::Pin};

use bytes::Bytes;
use http::{Request, Response, StatusCode};
use http_body_util::{BodyExt, Full, combinators::UnsyncBoxBody};
use hyper::body::Incoming;
use hyper::server::conn::http2;
use hyper::service::Service;
use hyper_util::rt::{TokioExecutor, TokioIo};
use restate_sdk::endpoint::{Endpoint, HandlerOptions, ServiceOptions};
use restate_sdk::service::IntoServiceDefinition;
use tokio::net::TcpListener;

use super::{
    config::EffectHandlerConfig,
    effect_artifact::{
        EffectHandlerArtifact, ZOEN_EFFECT_HANDLER_NAME, ZOEN_EFFECT_OWNER,
        ZOEN_EFFECT_SERVICE_NAME, handler_metadata,
    },
    service::ZoenEffect,
};

/// Artifact identity path probed by the registrar over HTTP/2.
pub const ARTIFACT_PATH: &str = "/zoen/artifact";

type BoxError = Box<dyn Error + Send + Sync>;
type ResponseBody = UnsyncBoxBody<Bytes, BoxError>;

/// Server startup or runtime failure.
#[derive(Debug)]
pub struct ServerError(pub String);

impl fmt::Display for ServerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl Error for ServerError {}

/// Serve the handler until SIGINT or SIGTERM.
///
/// # Errors
///
/// Returns [`ServerError`] when the listener cannot bind or accept.
pub async fn serve(
    config: &EffectHandlerConfig,
    artifact: &EffectHandlerArtifact,
    service: ZoenEffect,
) -> Result<(), ServerError> {
    let address: SocketAddr = format!("{}:{}", config.listen.host, config.listen.port)
        .parse()
        .map_err(|error| {
            ServerError(format!("effect handler listen address is invalid: {error}"))
        })?;
    let listener = TcpListener::bind(address)
        .await
        .map_err(|error| ServerError(format!("effect handler failed to bind: {error}")))?;
    let router = Router::new(artifact, service);
    let graceful = hyper_util::server::graceful::GracefulShutdown::new();
    let mut shutdown = Box::pin(shutdown_signal());

    loop {
        tokio::select! {
            accepted = listener.accept() => {
                let (stream, remote) = accepted.map_err(|error| {
                    ServerError(format!("effect handler accept failed: {error}"))
                })?;
                let router = router.clone();
                let connection = http2::Builder::new(TokioExecutor::new())
                    .serve_connection(TokioIo::new(stream), router);
                let watched = graceful.watch(connection);
                tokio::spawn(async move {
                    if let Err(error) = watched.await {
                        eprintln!("effect handler connection {remote} failed: {error:?}");
                    }
                });
            }
            () = &mut shutdown => {
                break;
            }
        }
    }
    drop(listener);
    tokio::select! {
        () = graceful.shutdown() => {}
        () = tokio::time::sleep(std::time::Duration::from_secs(10)) => {
            eprintln!("effect handler timed out waiting for connections to close");
        }
    }
    Ok(())
}

async fn shutdown_signal() {
    let interrupt = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        () = interrupt => {}
        () = terminate => {}
    }
}

#[derive(Clone)]
struct Router {
    artifact_json: Bytes,
    endpoint: Endpoint,
}

impl Router {
    fn new(artifact: &EffectHandlerArtifact, service: ZoenEffect) -> Self {
        let mut service_options = ServiceOptions::new();
        for (key, value) in handler_metadata(artifact) {
            service_options = service_options.metadata(key, value);
        }
        let mut handler_options = HandlerOptions::new();
        for (key, value) in handler_metadata(artifact) {
            handler_options = handler_options.metadata(key, value);
        }
        service_options = service_options.handler(ZOEN_EFFECT_HANDLER_NAME, handler_options);
        let endpoint = Endpoint::builder()
            .bind(service.into_service_definition().options(service_options))
            .build();
        let document = serde_json::json!({
            "artifact": artifact.revision,
            "handler": ZOEN_EFFECT_HANDLER_NAME,
            "owner": ZOEN_EFFECT_OWNER,
            "service": ZOEN_EFFECT_SERVICE_NAME,
        });
        Self {
            artifact_json: Bytes::from(document.to_string()),
            endpoint,
        }
    }
    fn route(&self, request: Request<Incoming>) -> Response<ResponseBody> {
        if request.method() == http::Method::GET && request.uri().path() == ARTIFACT_PATH {
            return Response::builder()
                .status(StatusCode::OK)
                .header("cache-control", "no-store")
                .header("content-type", "application/json")
                .body(full_body(self.artifact_json.clone()))
                .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR));
        }
        let endpoint_response = self.endpoint.handle(request);
        let (parts, body) = endpoint_response.into_parts();
        let mut builder = Response::builder().status(parts.status);
        for (name, value) in &parts.headers {
            builder = builder.header(name, value);
        }
        builder
            .body(body.boxed_unsync())
            .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR))
    }
}

impl Service<Request<Incoming>> for Router {
    type Response = Response<ResponseBody>;
    type Error = Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn call(&self, request: Request<Incoming>) -> Self::Future {
        let router = self.clone();
        Box::pin(async move { Ok(router.route(request)) })
    }
}

fn empty_response(status: StatusCode) -> Response<ResponseBody> {
    Response::builder()
        .status(status)
        .body(full_body(Bytes::new()))
        .unwrap_or_else(|_| Response::new(full_body(Bytes::new())))
}

fn full_body(bytes: Bytes) -> ResponseBody {
    Full::new(bytes)
        .map_err(|error: Infallible| match error {})
        .boxed_unsync()
}
