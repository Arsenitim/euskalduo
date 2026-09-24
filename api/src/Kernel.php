<?php

declare(strict_types=1);

namespace App;

use Symfony\Bundle\FrameworkBundle\FrameworkBundle;
use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\DependencyInjection\Loader\Configurator\ContainerConfigurator;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;
use Symfony\Component\Routing\Loader\Configurator\RoutingConfigurator;

final class Kernel extends BaseKernel
{
    use MicroKernelTrait;

    public function registerBundles(): iterable
    {
        yield new FrameworkBundle();
    }

    public function getCacheDir(): string
    {
        return ($_SERVER['APP_CACHE_DIR'] ?? $this->getProjectDir().'/var/cache').'/'.$this->environment;
    }

    public function getLogDir(): string
    {
        return $_SERVER['APP_LOG_DIR'] ?? $this->getProjectDir().'/var/log';
    }

    private function configureContainer(ContainerConfigurator $container): void
    {
        $container->parameters()
            ->set('env(DATA_DIR)', '/data')
            ->set('env(UPLOAD_DIR)', '/uploads')
            ->set('env(ADMIN_USERNAME)', 'admin')
            ->set('env(ADMIN_PASSWORD)', '')
            ->set('env(ADMIN_PASSWORD_HASH)', '')
            ->set('env(FEEDBACK_MAX_MB)', '256')
            ->set('env(FEEDBACK_CONTACT)', '');

        $container->extension('framework', [
            'secret' => '%env(APP_SECRET)%',
            'http_method_override' => false,
            'secrets' => ['enabled' => false],
            'handle_all_throwables' => true,
            'php_errors' => ['log' => true],
            // Sessions exist only for the admin. Learner requests never start one,
            // so they never receive a cookie.
            'session' => [
                'enabled' => true,
                'name' => 'euskalduo_admin',
                'handler_id' => null,
                'cookie_secure' => 'auto',
                'cookie_samesite' => 'strict',
                'cookie_httponly' => true,
                'cookie_lifetime' => 0,
                'gc_maxlifetime' => 8 * 3600,
            ],
            'router' => ['utf8' => true],
        ]);

        if ('test' === $this->environment) {
            $container->extension('framework', [
                'test' => true,
                'session' => ['storage_factory_id' => 'session.storage.factory.mock_file'],
            ]);
        }

        $services = $container->services()
            ->defaults()
                ->autowire()
                ->autoconfigure();

        $services->load('App\\', __DIR__.'/')
            ->exclude([__DIR__.'/Kernel.php']);

        $services->get(Content\Database::class)
            ->arg('$dataDir', '%env(DATA_DIR)%');
        $services->get(Content\ImageStore::class)
            ->arg('$uploadDir', '%env(UPLOAD_DIR)%');
        $services->get(Feedback\FeedbackStore::class)
            ->arg('$dataDir', '%env(DATA_DIR)%')
            ->arg('$maxMegabytes', '%env(int:FEEDBACK_MAX_MB)%');
        $services->get(Controller\FeedbackController::class)
            ->arg('$contact', '%env(FEEDBACK_CONTACT)%');
        $services->get(Security\AdminCredentials::class)
            ->arg('$dataDir', '%env(DATA_DIR)%')
            ->arg('$username', '%env(ADMIN_USERNAME)%')
            ->arg('$plainPassword', '%env(ADMIN_PASSWORD)%')
            ->arg('$passwordHash', '%env(ADMIN_PASSWORD_HASH)%');
    }

    private function configureRoutes(RoutingConfigurator $routes): void
    {
        $routes->import(__DIR__.'/Controller/', 'attribute');
    }
}
