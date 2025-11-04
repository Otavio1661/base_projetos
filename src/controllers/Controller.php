<?php

namespace src\controllers;

use core\Controller as ctrl;
use src\resources\alert;


class Controller extends ctrl
{
    public function alertSuccessMini() {
        $data = ctrl::getPost();

        alert::successToast(
            $data['message'] ?? "Operação realizada com sucesso!",
            $data['title'] ?? "Sucesso!",
            $data['duration'] ?? 5000
        );
    }


    public function alertSuccess() {
        $data = ctrl::getPost();

        alert::successModal(
            $data['message'] ?? "Operação realizada com sucesso!",
            $data['title'] ?? "Sucesso!",
            $data['btnText'] ?? "Entendi",
            $data['duration'] ?? ['#', false]
        );
    }


    public function alertErrorMini() {
        $data = ctrl::getPost();

        alert::errorToast(
            $data['message'] ?? "Ocorreu um erro na operação!",
            $data['title'] ?? "Erro!",
            $data['duration'] ?? 5000
        );
    }

    public function alertError() {
        $data = ctrl::getPost();

        alert::errorModal(
            $data['message'] ?? "Ocorreu um erro na operação!",
            $data['title'] ?? "Erro!",
            $data['btnText'] ?? "Tentar novamente",
            $data['acao'] ?? ['#', false],
            $data['duration'] ?? ['#', false]
        );
    }

}